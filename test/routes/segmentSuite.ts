///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Segments, lead scoring, and campaigns aimed at segments - identical on both backends.
import { CrmTestContext, call, setUpWorkspace } from "./context.js";

export function segmentSuite(ctx: CrmTestContext): void {
    describe("segments and scoring", () => {
        let workspaceUid: string;
        const contact = async (email: string, extra: Record<string, unknown> = {}) =>
            (await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email, ...extra })).body;
        const segmentsOf = async (contactUid: string) =>
            (await (await ctx.repo("propertyValue")).find({ objectUid: contactUid, key: "segments" }, { ignoreACL: true, limit: 50 })).map((row: any) => row.stringValue);
        const scoreOf = async (contactUid: string) => (await (await ctx.repo("contact")).findOne(contactUid, { ignoreACL: true, skipCache: true })).score;
        const workspaceRow = async () => await (await ctx.repo("workspace")).findOne(workspaceUid, { ignoreACL: true, skipCache: true });
        const vipFilter = { field: "tags", op: "eq", value: "vip" };

        beforeEach(async () => {
            workspaceUid = await setUpWorkspace(ctx);
        });

        it("creates dynamic and static segments with their members, and keeps dynamic ones current", async () => {
            const ann = await contact("ann@x.example", { tags: ["vip"] });
            const bob = await contact("bob@x.example");
            const created = await call(ctx, "post", `/segments/${workspaceUid}`, ctx.users.editor, { name: "VIPs", description: "Big spenders", filter: vipFilter });
            expect(created.body).toMatchObject({ name: "VIPs", kind: "dynamic", memberCount: 1, capped: false, createdByUserUid: ctx.users.editor.uid });
            expect(created.body.refreshedAt).toBeTruthy();
            const frozen = (await call(ctx, "post", `/segments/${workspaceUid}`, ctx.users.editor, { name: "Launch list", kind: "static", filter: vipFilter })).body;
            expect(await segmentsOf(ann.uid)).toEqual(expect.arrayContaining([created.body.uid, frozen.uid]));

            // Contacts filter by segment.
            const search = await call(ctx, "post", `/contacts/${workspaceUid}/search`, ctx.users.viewer, { filter: { field: "segments", op: "eq", value: created.body.uid } });
            expect(search.body.items.map((item: any) => item.email)).toEqual(["ann@x.example"]);

            // Bob becomes a VIP: the job picks it up once the segment is due; the static one stays as it was.
            await call(ctx, "put", `/contacts/${workspaceUid}/${bob.uid}`, ctx.users.editor, { tags: ["vip"] });
            const job = await ctx.job("segments");
            expect(job.schedule).toBe("0 * * * * *");
            await job.run();
            expect(await segmentsOf(bob.uid)).toEqual([]);
            job.refreshSeconds = 0;
            await job.run();
            expect(await segmentsOf(bob.uid)).toEqual([created.body.uid]);
            expect((await call(ctx, "get", `/segments/${workspaceUid}/${created.body.uid}`, ctx.users.viewer)).body.memberCount).toBe(2);
            expect((await call(ctx, "get", `/segments/${workspaceUid}/${frozen.uid}`, ctx.users.viewer)).body.memberCount).toBe(1);

            // A static segment changes only when refreshed by hand; Ann stops being a VIP.
            await call(ctx, "put", `/contacts/${workspaceUid}/${ann.uid}`, ctx.users.editor, { tags: [] });
            const refreshed = await call(ctx, "post", `/segments/${workspaceUid}/${frozen.uid}/refresh`, ctx.users.editor);
            expect(refreshed.body.memberCount).toBe(1);
            expect(await segmentsOf(ann.uid)).toEqual([created.body.uid]);
            expect(await segmentsOf(bob.uid)).toEqual(expect.arrayContaining([created.body.uid, frozen.uid]));
            expect((await call(ctx, "post", `/segments/${workspaceUid}/${frozen.uid}/refresh`, ctx.users.viewer)).status).toBe(403);
        });

        it("changes and deletes segments, refusing bad filters and filters on segments", async () => {
            await contact("ann@x.example", { tags: ["vip"] });
            const segment = (await call(ctx, "post", `/segments/${workspaceUid}`, ctx.users.editor, { name: "VIPs", filter: vipFilter })).body;
            for (const body of [{ name: "x" }, { name: "x", filter: { field: "nope", op: "eq", value: 1 } }, { name: "x", filter: { field: "segments", op: "eq", value: segment.uid } }, { name: "x", kind: "frozen", filter: vipFilter }]) {
                expect((await call(ctx, "post", `/segments/${workspaceUid}`, ctx.users.editor, body)).status).toBe(400);
            }
            expect((await call(ctx, "post", `/segments/${workspaceUid}`, ctx.users.viewer, { name: "x", filter: vipFilter })).status).toBe(403);
            expect((await call(ctx, "put", `/segments/${workspaceUid}/${segment.uid}`, ctx.users.editor, { name: null })).status).toBe(400);

            // Renaming doesn't recompute; a new filter does.
            const renamed = await call(ctx, "put", `/segments/${workspaceUid}/${segment.uid}`, ctx.users.editor, { name: "Top", description: "Best" });
            expect(renamed.body).toMatchObject({ name: "Top", description: "Best", memberCount: 1 });
            const refiltered = await call(ctx, "put", `/segments/${workspaceUid}/${segment.uid}`, ctx.users.editor, {
                filter: { field: "email", op: "contains", value: "nobody" },
                kind: "static",
            });
            expect(refiltered.body).toMatchObject({ kind: "static", memberCount: 0 });
            await call(ctx, "put", `/segments/${workspaceUid}/${segment.uid}`, ctx.users.editor, { filter: vipFilter, description: null });

            expect((await call(ctx, "delete", `/segments/${workspaceUid}/${segment.uid}`, ctx.users.editor)).status).toBe(204);
            expect(await (await ctx.repo("propertyValue")).find({ key: "segments", stringValue: segment.uid }, { ignoreACL: true, limit: 10 })).toEqual([]);
        });

        it("previews how many contacts a filter matches, and caps segments at their size limit", async () => {
            await Promise.all(["ann@x.example", "bob@x.example", "cat@x.example"].map((email) => contact(email, { tags: ["vip"] })));
            const preview = await call(ctx, "post", `/segments/${workspaceUid}/preview`, ctx.users.viewer, { filter: vipFilter });
            expect(preview.body).toMatchObject({ count: 3, capped: false });
            expect(preview.body.contacts.map((entry: any) => entry.email)).toEqual(["ann@x.example", "bob@x.example", "cat@x.example"]);
            expect((await call(ctx, "post", `/segments/${workspaceUid}/preview`, ctx.users.viewer, { filter: { field: "email", op: "eq", value: "none@x" } })).body).toEqual({
                count: 0,
                capped: false,
                contacts: [],
            });
            const { matchingContacts } = await import("../../src/segments/Segments.js");
            const capped = await matchingContacts(ctx.route("SegmentRoute").repos(), workspaceUid, vipFilter as any, 2);
            expect(capped).toMatchObject({ capped: true });
            expect(capped.uids).toHaveLength(2);
        });

        it("reads and writes members in pages, and logs a refresh that fails", async () => {
            const people = await Promise.all(Array.from({ length: 3 }, (_v, i) => contact(`p${i}@x.example`, { tags: ["vip"] })));
            const segment = (await call(ctx, "post", `/segments/${workspaceUid}`, ctx.users.editor, { name: "VIPs", filter: vipFilter })).body;
            // One row a page, to walk the paging of members, matches and scores.
            const { PAGING, matchingContacts, segmentMembers } = await import("../../src/segments/Segments.js");
            const { countActivity, scoreWorkspace } = await import("../../src/scoring/Scoring.js");
            const repos = ctx.route("SegmentRoute").repos();
            PAGING.size = 1;
            try {
                expect((await segmentMembers(repos, segment.uid)).size).toBe(3);
                expect((await matchingContacts(repos, workspaceUid, vipFilter as any)).uids).toHaveLength(3);
                const TimelineClass = ctx.route("ContactRoute").classes.timelineEvent;
                for (const person of people) {
                    await (await ctx.repo("timelineEvent")).create(
                        new TimelineClass({ workspaceUid, subjectType: "contact", subjectUid: person.uid, kind: "subscribed", summary: "x", occurredAt: new Date(), data: {} }),
                        { ignoreACL: true },
                    );
                }
                expect((await countActivity(repos, workspaceUid, { activity: "subscribed" } as any)).size).toBe(3);
                expect(await scoreWorkspace(repos, workspaceUid, [{ enabled: true, kind: "activity", activity: "subscribed", points: 2 } as any])).toBe(3);
            } finally {
                PAGING.size = 1000;
            }

            const job = await ctx.job("segments");
            job.refreshSeconds = 0;
            const segments = await ctx.repo("segment");
            vi.spyOn(segments, "update").mockRejectedValueOnce(new Error("disk full"));
            await job.run();
            vi.spyOn(segments, "update").mockRejectedValueOnce(new Error("version mismatch"));
            await job.run();
            vi.restoreAllMocks();
            expect(people).toHaveLength(3);
        });

        it("aims campaigns at segments, and leaves segment members out", async () => {
            await call(ctx, "put", `/workspaces/${workspaceUid}`, ctx.users.owner, { postalAddress: "1 Main St" });
            await ctx.createMailbox(ctx.users.owner.uid, "news@acme.example");
            const senderUid = (await call(ctx, "post", `/workspaces/${workspaceUid}/senders`, ctx.users.owner, { fromAddress: "news@acme.example" })).body.uid;
            const templateUid = (await call(ctx, "post", `/templates/${workspaceUid}`, ctx.users.editor, { name: "T", subject: "Hi" })).body.uid;
            const listUid = (await call(ctx, "post", `/lists/${workspaceUid}`, ctx.users.owner, { name: "News" })).body.uid;
            const ann = await contact("ann@x.example", { tags: ["vip"] });
            const bob = await contact("bob@x.example", { tags: ["vip", "churned"] });
            const cat = await contact("cat@x.example");
            await call(ctx, "post", `/subscriptions/${workspaceUid}`, ctx.users.editor, { listUid, contactUids: [ann.uid, bob.uid, cat.uid], status: "subscribed" });
            const vips = (await call(ctx, "post", `/segments/${workspaceUid}`, ctx.users.editor, { name: "VIPs", filter: vipFilter })).body.uid;
            const churned = (await call(ctx, "post", `/segments/${workspaceUid}`, ctx.users.editor, { name: "Churned", filter: { field: "tags", op: "eq", value: "churned" } })).body.uid;

            const audience = await call(ctx, "post", `/campaigns/${workspaceUid}/audience`, ctx.users.viewer, { listUids: [listUid], segmentUids: [vips], excludeSegmentUids: [churned] });
            expect(audience.body.count).toBe(1);
            expect((await call(ctx, "post", `/campaigns/${workspaceUid}/audience`, ctx.users.viewer, { listUids: [listUid], segmentUids: ["nope"] })).status).toBe(400);
            expect((await call(ctx, "post", `/campaigns/${workspaceUid}/audience`, ctx.users.viewer, { listUids: [listUid], segmentUids: "x" })).status).toBe(400);

            const campaign = (
                await call(ctx, "post", `/campaigns/${workspaceUid}`, ctx.users.editor, {
                    name: "VIP launch",
                    templateUid,
                    senderUid,
                    listUids: [listUid],
                    segmentUids: [vips],
                    excludeSegmentUids: [churned],
                })
            ).body;
            expect(campaign).toMatchObject({ segmentUids: [vips], excludeSegmentUids: [churned] });
            expect((await call(ctx, "post", `/campaigns/${workspaceUid}/${campaign.uid}/duplicate`, ctx.users.editor)).body.segmentUids).toEqual([vips]);
            await call(ctx, "post", `/campaigns/${workspaceUid}/${campaign.uid}/schedule`, ctx.users.editor, {});
            await (await ctx.job("campaign")).run();
            const sends = await (await ctx.repo("outboundSend")).find({ sourceUid: campaign.uid }, { ignoreACL: true, limit: 10 });
            expect(sends.map((send: any) => send.email)).toEqual(["ann@x.example"]);
        });

        it("scores contacts by property and activity rules, and resets scores when the rules go", async () => {
            const ann = await contact("ann@x.example", { tags: ["vip"] });
            const bob = await contact("bob@x.example");
            // Activity: Bob submitted a form twice, Ann once long ago; opens, one of them by a machine.
            const timeline = await ctx.repo("timelineEvent");
            const TimelineClass = ctx.route("ContactRoute").classes.timelineEvent;
            for (const [subjectUid, daysAgo] of [
                [bob.uid, 1],
                [bob.uid, 2],
                [ann.uid, 400],
            ] as const) {
                await timeline.create(
                    new TimelineClass({ workspaceUid, subjectType: "contact", subjectUid, kind: "form_submitted", summary: "x", occurredAt: new Date(Date.now() - daysAgo * 86_400_000), data: {} }),
                    { ignoreACL: true },
                );
            }
            const events = await ctx.repo("engagementEvent");
            const EventClass = ctx.route("ContactRoute").classes.engagementEvent;
            for (const machine of [false, true]) {
                await events.create(
                    new EventClass({ workspaceUid, sendUid: "s", sourceUid: "c", contactUid: ann.uid, variantId: "A", type: "opened", occurredAt: new Date(), data: { machine } }),
                    { ignoreACL: true },
                );
            }

            const rules = `/scoring-rules/${workspaceUid}`;
            expect((await call(ctx, "post", rules, ctx.users.editor, { name: "VIP", kind: "property", filter: vipFilter, points: 20 })).status).toBe(403);
            const vip = (await call(ctx, "post", rules, ctx.users.owner, { name: "VIP", kind: "property", filter: vipFilter, points: 20 })).body;
            expect(vip).toMatchObject({ enabled: true, points: 20 });
            const forms = (await call(ctx, "post", rules, ctx.users.owner, { name: "Forms", kind: "activity", activity: "form_submitted", points: 15, maxPoints: 25, withinDays: 30 })).body;
            await call(ctx, "post", rules, ctx.users.owner, { name: "Opens", kind: "activity", activity: "opened", points: 5 });
            for (const body of [
                { name: "x", kind: "magic", points: 1 },
                { name: "x", kind: "property", filter: vipFilter },
                { name: "x", kind: "property", filter: vipFilter, points: 500 },
                { name: "x", kind: "activity", points: 1 },
                { name: "x", kind: "activity", activity: "opened", points: 1, withinDays: 0 },
                { kind: "property", filter: vipFilter, points: 1 },
            ]) {
                expect((await call(ctx, "post", rules, ctx.users.owner, body)).status).toBe(400);
            }
            expect(await workspaceRow()).toMatchObject({ scoringRules: 3, scoringDirty: true });

            const job = await ctx.job("scoring");
            expect(job.schedule).toBe("30 * * * * *");
            await job.run();
            expect(await scoreOf(ann.uid)).toBe(25);
            expect(await scoreOf(bob.uid)).toBe(25);
            expect(await workspaceRow()).toMatchObject({ scoringDirty: false });
            // Scored recently and not dirty: nothing to do.
            await job.run();

            // Rule changes: disable the form rule, change points, and the kind can't change.
            expect((await call(ctx, "put", `${rules}/${forms.uid}`, ctx.users.owner, { kind: "property" })).status).toBe(400);
            expect((await call(ctx, "put", `${rules}/${forms.uid}`, ctx.users.owner, { name: null })).status).toBe(400);
            expect((await call(ctx, "put", `${rules}/${forms.uid}`, ctx.users.owner, { points: null })).status).toBe(400);
            await call(ctx, "put", `${rules}/${forms.uid}`, ctx.users.owner, { enabled: false, name: "Forms (off)", maxPoints: 100 });
            await call(ctx, "put", `${rules}/${vip.uid}`, ctx.users.owner, { points: -10, filter: vipFilter, kind: "property" });
            const recalculated = await call(ctx, "post", `${rules}/recalculate`, ctx.users.owner);
            expect(recalculated.body).toEqual({ changed: 2 });
            expect(await scoreOf(ann.uid)).toBe(-5);
            expect(await scoreOf(bob.uid)).toBe(0);
            expect((await call(ctx, "post", `${rules}/recalculate`, ctx.users.editor)).status).toBe(403);

            // Every rule gone: scores go back to 0.
            for (const rule of (await call(ctx, "get", rules, ctx.users.viewer)).body) {
                await call(ctx, "delete", `${rules}/${rule.uid}`, ctx.users.owner);
            }
            expect(await workspaceRow()).toMatchObject({ scoringRules: 0, scoringDirty: true });
            await job.run();
            expect(await scoreOf(ann.uid)).toBe(0);

            // Rules on a workspace scored long ago are rescored; a failing workspace is logged; a lost race isn't.
            await call(ctx, "post", rules, ctx.users.owner, { name: "VIP", kind: "property", filter: vipFilter, points: 7 });
            const row = await workspaceRow();
            await (await ctx.repo("workspace")).update({ uid: workspaceUid, version: row.version, scoringDirty: false, scoredAt: new Date(0) }, row, { ignoreACL: true });
            await job.run();
            expect(await scoreOf(ann.uid)).toBe(7);
            const workspaces = await ctx.repo("workspace");
            job.intervalSeconds = 0;
            vi.spyOn(workspaces, "update").mockRejectedValueOnce(new Error("disk full"));
            await job.run();
            vi.spyOn(workspaces, "update").mockRejectedValueOnce(new Error("version mismatch"));
            await job.run();
            vi.restoreAllMocks();
        });

        it("retries the workspace's bookkeeping on a lost race, and gives up on other errors", async () => {
            const workspaces = await ctx.repo("workspace");
            const update = workspaces.update.bind(workspaces);
            let conflicts: number = 1;
            vi.spyOn(workspaces, "update").mockImplementation(async (...args: any[]) => {
                if (conflicts-- > 0) {
                    throw new Error("version mismatch");
                }
                return await update(...args);
            });
            expect((await call(ctx, "post", `/scoring-rules/${workspaceUid}`, ctx.users.owner, { name: "VIP", kind: "property", filter: vipFilter, points: 1 })).status).toBe(200);
            conflicts = 10;
            expect((await call(ctx, "post", `/scoring-rules/${workspaceUid}`, ctx.users.owner, { name: "VIP2", kind: "property", filter: vipFilter, points: 1 })).status).toBe(500);
            vi.restoreAllMocks();
        });
    });
}
