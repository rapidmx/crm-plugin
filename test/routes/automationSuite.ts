///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Automations: drafting and publishing graphs, triggers, every kind of step, waits on emails, re-entry, goals, pausing, and the
// jobs that run them - identical on both backends.
import { CrmTestContext, call, setUpWorkspace } from "./context.js";

export function automationSuite(ctx: CrmTestContext): void {
    describe("automations", () => {
        let workspaceUid: string;
        let senderUid: string;
        let welcomeUid: string;
        let followUpUid: string;
        let listUid: string;
        const path = (suffix: string = "") => `/automations/${workspaceUid}${suffix}`;
        const contact = async (email: string, extra: Record<string, unknown> = {}) =>
            (await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email, firstName: "Ann", ...extra })).body;
        const subscribe = async (contactUid: string, list: string = listUid) =>
            await call(ctx, "post", `/subscriptions/${workspaceUid}`, ctx.users.editor, { listUid: list, contactUids: [contactUid], status: "subscribed" });
        const run = async (name: "triggers" | "automations" | "send") => await (await ctx.job(name)).run();
        /** Runs the jobs the way the server would, a few times over. */
        const turn = async () => {
            for (let round = 0; round < 3; round++) {
                await run("triggers");
                await run("automations");
            }
        };
        const enrollmentsOf = async (automationUid: string) =>
            (await (await ctx.repo("enrollment")).find({ automationUid }, { ignoreACL: true, limit: 100 })).sort((a: any, b: any) => a.contactUid.localeCompare(b.contactUid));
        const enrollmentOf = async (automationUid: string, contactUid: string) =>
            (await (await ctx.repo("enrollment")).find({ automationUid, contactUid }, { ignoreACL: true, limit: 10 }))[0];
        /** Makes an enrollment due now, as if its delay or wait had run out. */
        const due = async (enrollment: any) => {
            const repo = await ctx.repo("enrollment");
            const row = await repo.findOne(enrollment.uid, { ignoreACL: true, skipCache: true });
            await repo.update({ uid: row.uid, version: row.version, nextRunAt: new Date(Date.now() - 1000) }, row, { ignoreACL: true });
        };
        const tagsOf = async (contactUid: string) => (await (await ctx.repo("contact")).findOne(contactUid, { ignoreACL: true, skipCache: true })).tags;
        /** Creates an automation with `graph` and publishes it. */
        const published = async (graph: unknown, extra: Record<string, unknown> = {}) => {
            const created = (await call(ctx, "post", path(), ctx.users.editor, { name: "Flow", graph, ...extra })).body;
            const result = await call(ctx, "post", path(`/${created.uid}/publish`), ctx.users.editor);
            expect(result.body.message).toBeUndefined();
            return result.body;
        };
        const trigger = (config: Record<string, unknown> = { event: "list.subscribed", listUid: undefined }) => ({ id: "t", type: "trigger", config: { event: "list.subscribed", listUid, ...config } });
        const chain = (...nodes: any[]) => ({
            nodes,
            edges: nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id, port: "next" })),
        });

        beforeEach(async () => {
            workspaceUid = await setUpWorkspace(ctx);
            await call(ctx, "put", `/workspaces/${workspaceUid}`, ctx.users.owner, { postalAddress: "1 Main St" });
            await ctx.createMailbox(ctx.users.owner.uid, "news@acme.example");
            senderUid = (await call(ctx, "post", `/workspaces/${workspaceUid}/senders`, ctx.users.owner, { fromAddress: "news@acme.example" })).body.uid;
            welcomeUid = (await call(ctx, "post", `/templates/${workspaceUid}`, ctx.users.editor, { name: "Welcome", subject: "Welcome {{ contact.first_name }}" })).body.uid;
            followUpUid = (await call(ctx, "post", `/templates/${workspaceUid}`, ctx.users.editor, { name: "Follow-up", subject: "Still there?" })).body.uid;
            listUid = (await call(ctx, "post", `/lists/${workspaceUid}`, ctx.users.owner, { name: "News" })).body.uid;
            ctx.transport().sent = [];
        });

        it("welcomes a subscriber, then follows up only if they don't reply within 3 days", async () => {
            const graph = {
                nodes: [
                    trigger(),
                    { id: "welcome", type: "send_email", config: { templateUid: welcomeUid, senderUid } },
                    { id: "wait", type: "wait", config: { event: "email.replied", sendNodeId: "welcome", timeoutAmount: 3, timeoutUnit: "days" } },
                    { id: "tag", type: "add_tag", config: { tag: "Replied" } },
                    { id: "followup", type: "send_email", config: { templateUid: followUpUid, senderUid, subject: "Just checking in" } },
                ],
                edges: [
                    { from: "t", to: "welcome", port: "next" },
                    { from: "welcome", to: "wait", port: "next" },
                    { from: "wait", to: "tag", port: "matched" },
                    { from: "wait", to: "followup", port: "timeout" },
                ],
            };
            const automation = await published(graph);
            expect(automation).toMatchObject({ status: "active" });
            const ann = await contact("ann@x.example");
            const bob = await contact("bob@x.example");
            await subscribe(ann.uid);
            await subscribe(bob.uid);
            await turn();
            const [annIn, bobIn] = [await enrollmentOf(automation.uid, ann.uid), await enrollmentOf(automation.uid, bob.uid)];
            expect(annIn).toMatchObject({ state: "waiting", currentNodeId: "wait", waitFor: { nodeId: "wait", event: "email.replied" } });
            expect(new Date(annIn.nextRunAt).getTime()).toBeGreaterThan(Date.now() + 2.9 * 86_400_000);
            await run("send");
            expect(ctx.transport().sent.map((message) => message.envelopeTo[0]).sort()).toEqual(["ann@x.example", "bob@x.example"]);

            // Ann replies to her welcome.
            const annSend = (await (await ctx.repo("outboundSend")).find({ contactUid: ann.uid }, { ignoreACL: true, limit: 5 }))[0];
            expect(annSend).toMatchObject({ sourceType: "automation", sourceUid: automation.uid, nodeId: "welcome", status: "sent" });
            await (await ctx.job("events")).handle({
                type: "message.delivered",
                occurredAt: new Date().toISOString(),
                mailboxUid: "news@acme.example",
                messageUid: "m",
                envelopeTo: ["news@acme.example"],
                references: [],
                inReplyTo: annSend.messageId,
            });
            await turn();
            expect(await enrollmentOf(automation.uid, ann.uid)).toMatchObject({ state: "completed" });
            expect(await tagsOf(ann.uid)).toEqual(["replied"]);

            // Bob doesn't: three days on, he gets the follow-up.
            await due(bobIn);
            await turn();
            expect(await enrollmentOf(automation.uid, bob.uid)).toMatchObject({ state: "completed" });
            ctx.transport().sent = [];
            await run("send");
            const followUps = ctx.transport().sent.map((message) => message.raw.toString("utf-8"));
            expect(followUps).toHaveLength(1);
            expect(followUps[0]).toContain("Subject: Just checking in");
            expect(followUps[0]).toContain("To: bob@x.example");

            const report = (await call(ctx, "get", path(`/${automation.uid}/report`), ctx.users.viewer)).body;
            expect(report.states).toMatchObject({ completed: 2, active: 0, waiting: 0 });
            expect(report.nodes.welcome).toMatchObject({ current: 0, sent: 2, replied: 1 });
            expect(report.nodes.followup).toMatchObject({ sent: 1 });
            const timeline = (await call(ctx, "get", `/timeline/${workspaceUid}/contact/${bob.uid}`, ctx.users.viewer)).body.map((entry: any) => entry.summary);
            expect(timeline).toEqual(expect.arrayContaining(['Entered the automation "Flow"', 'Finished the automation "Flow"', 'Sent "Flow"']));
        });

        it("drafts, checks and publishes graphs, refusing what can't run", async () => {
            const created = await call(ctx, "post", path(), ctx.users.editor, { name: "Draft" });
            expect(created.body).toMatchObject({ status: "draft", reentry: "never", graph: { nodes: [{ id: "trigger", type: "trigger" }], edges: [] } });
            const uid: string = created.body.uid;
            const put = (body: unknown) => call(ctx, "put", path(`/${uid}`), ctx.users.editor, body);
            for (const graph of [
                "x",
                { nodes: "x", edges: [] },
                { nodes: Array.from({ length: 201 }, (_v, i) => ({ id: `n${i}`, type: "exit" })), edges: [] },
                { nodes: [{ id: "a b", type: "exit" }], edges: [] },
                { nodes: [{ id: "a", type: "exit" }, { id: "a", type: "exit" }], edges: [] },
                { nodes: [{ id: "a", type: "teleport" }], edges: [] },
                { nodes: [{ id: "a", type: "exit", config: "x" }], edges: [] },
                { nodes: [{ id: "a", type: "exit" }], edges: [{ from: "a", to: "zz" }] },
                { nodes: [{ id: "a", type: "exit" }, { id: "b", type: "exit" }], edges: [{ from: "a", to: "b" }] },
                { nodes: [{ id: "a", type: "delay" }, { id: "b", type: "exit" }], edges: [{ from: "a", to: "b" }, { from: "a", to: "b" }] },
            ]) {
                expect({ graph, status: (await put({ graph })).status }).toEqual({ graph, status: 400 });
            }
            expect((await put({ name: null })).status).toBe(400);
            expect((await put({ goalFilter: { field: "nope", op: "eq", value: 1 } })).status).toBe(400);
            expect((await put({ name: "Renamed", description: "Hi", reentry: "after_exit", goalFilter: { field: "tags", op: "eq", value: "customer" } })).body).toMatchObject({
                name: "Renamed",
                reentry: "after_exit",
            });
            expect((await put({ goalFilter: null, description: null })).status).toBe(200);

            const other = (await call(ctx, "post", path(), ctx.users.editor, { name: "Other" })).body.uid;
            const otherWorkspace = await setUpWorkspace(ctx, "Elsewhere");
            const theirList = (await call(ctx, "post", `/lists/${otherWorkspace}`, ctx.users.owner, { name: "Theirs" })).body.uid;
            const publishWith = async (graph: unknown) => {
                expect((await put({ graph })).status).toBe(200);
                return await call(ctx, "post", path(`/${uid}/publish`), ctx.users.editor);
            };
            const bad: [unknown, RegExp][] = [
                [{ nodes: [{ id: "x", type: "exit" }], edges: [] }, /exactly one trigger/],
                [chain(trigger()), /must lead somewhere/],
                [{ nodes: [trigger(), { id: "a", type: "delay", config: { amount: 1, unit: "days" } }], edges: [{ from: "t", to: "a" }, { from: "a", to: "t" }] }, /lead back/],
                [{ nodes: [trigger(), { id: "a", type: "exit" }, { id: "b", type: "exit" }], edges: [{ from: "t", to: "a" }] }, /can't be reached/],
                [chain(trigger({ event: "nope" }), { id: "a", type: "exit" }), /what starts/],
                [chain(trigger(), { id: "a", type: "delay", config: { amount: 0, unit: "days" } }), /amount/],
                [chain(trigger(), { id: "a", type: "delay", config: { amount: 1, unit: "weeks" } }), /unit/],
                [chain(trigger(), { id: "a", type: "wait", config: { event: "email.opened", sendNodeId: "t", timeoutAmount: 1, timeoutUnit: "days" } }), /earlier step/],
                [chain(trigger(), { id: "a", type: "wait", config: { event: "email.sent", sendNodeId: "t" } }), /what to wait for/],
                [chain(trigger(), { id: "a", type: "condition", config: {} }), /conditions/],
                [chain(trigger(), { id: "a", type: "condition", config: { filter: { field: "zz", op: "eq", value: 1 } } }), /./],
                [chain(trigger(), { id: "a", type: "split", config: { percent: 100 } }), /percent/],
                [chain(trigger(), { id: "a", type: "send_email", config: { senderUid } }), /templateUid/],
                [chain(trigger(), { id: "a", type: "send_email", config: { templateUid: "nope", senderUid } }), /an email template/],
                [chain(trigger(), { id: "a", type: "send_email", config: { templateUid: welcomeUid, senderUid: "nope", subject: "x" } }), /a sender/],
                [chain(trigger(), { id: "a", type: "set_field", config: { field: "email", value: "x" } }), /field to set/],
                [chain(trigger(), { id: "a", type: "set_field", config: { field: "leadStatus", value: 5 } }), /value/],
                [chain(trigger(), { id: "a", type: "add_tag", config: {} }), /tag/],
                [chain(trigger(), { id: "a", type: "subscribe", config: { listUid: theirList } }), /a list/],
                [chain(trigger({ formUid: "nope" }), { id: "a", type: "exit" }), /a form/],
                [chain(trigger({ segmentUid: "nope" }), { id: "a", type: "exit" }), /a segment/],
                [chain(trigger(), { id: "a", type: "create_task", config: { title: "Call", dueInDays: 0 } }), /dueInDays/],
                [chain(trigger(), { id: "a", type: "create_task", config: { title: "Call", assigneeUserUid: "nobody" } }), /a member/],
                [chain(trigger(), { id: "a", type: "notify", config: { userUid: ctx.users.owner.uid } }), /message/],
                [chain(trigger(), { id: "a", type: "enroll", config: { automationUid: uid } }), /another automation/],
                [
                    {
                        nodes: [trigger(), { id: "a", type: "add_tag", config: { tag: "x" } }, { id: "b", type: "remove_tag", config: { tag: "x" } }],
                        edges: [{ from: "t", to: "a" }, { from: "a", to: "b" }, { from: "b", to: "a" }],
                    },
                    /loop without a delay/,
                ],
            ];
            for (const [graph, message] of bad) {
                const result = await publishWith(graph);
                expect({ graph, status: result.status }).toEqual({ graph, status: 400 });
                expect(result.body.message).toMatch(message);
            }

            // Everything at once, and a loop through a delay, publishes.
            const segmentUid = (await call(ctx, "post", `/segments/${workspaceUid}`, ctx.users.editor, { name: "S", filter: { field: "tags", op: "eq", value: "x" } })).body.uid;
            const all = {
                nodes: [
                    trigger({ filter: { field: "segments", op: "eq", value: segmentUid }, segmentUid: "" }),
                    { id: "a", type: "condition", config: { filter: { field: "score", op: "gt", value: 1 } } },
                    { id: "b", type: "split", config: { percent: 50 } },
                    { id: "c", type: "create_task", config: { title: "Call", dueInDays: 2, assigneeUserUid: ctx.users.editor.uid } },
                    { id: "d", type: "notify", config: { userUid: ctx.users.owner.uid, message: "Look" } },
                    { id: "e", type: "enroll", config: { automationUid: other } },
                    { id: "f", type: "delay", config: { amount: 1, unit: "hours" } },
                ],
                edges: [
                    { from: "t", to: "a" },
                    { from: "a", to: "b", port: "yes" },
                    { from: "b", to: "c", port: "a" },
                    { from: "c", to: "d" },
                    { from: "d", to: "e" },
                    { from: "e", to: "f" },
                    { from: "f", to: "a" },
                ],
            };
            expect((await publishWith(all)).body).toMatchObject({ status: "active" });
            const second = await call(ctx, "post", path(`/${uid}/publish`), ctx.users.editor);
            expect(second.body.publishedVersionUid).not.toBe((await publishWith(all)).body.publishedVersionUid ?? "");
            const versions = await (await ctx.repo("automationVersion")).find({ automationUid: uid }, { ignoreACL: true, limit: 10 });
            expect(versions.map((version: any) => version.versionNumber).sort()).toEqual([1, 2, 3]);
            expect((await call(ctx, "post", path(`/${uid}/publish`), ctx.users.viewer)).status).toBe(403);
        });

        it("pauses and resumes, and enrolls contacts by hand as the re-entry rule allows", async () => {
            const automation = await published(chain(trigger({ event: "manual", listUid: undefined }), { id: "d", type: "delay", config: { amount: 1, unit: "minutes" } }), {
                reentry: "after_exit",
            });
            const ann = await contact("ann@x.example");
            const enroll = (contactUids: unknown) => call(ctx, "post", path(`/${automation.uid}/enroll`), ctx.users.editor, { contactUids });
            for (const contactUids of [[], "x", Array.from({ length: 501 }, () => "c")]) {
                expect((await enroll(contactUids)).status).toBe(400);
            }
            expect((await enroll([ann.uid, "nobody"])).body).toEqual({ enrolled: 1 });
            expect((await enroll([ann.uid])).body).toEqual({ enrolled: 0 });

            expect((await call(ctx, "post", path(`/${automation.uid}/resume`), ctx.users.editor)).status).toBe(400);
            expect((await call(ctx, "post", path(`/${automation.uid}/pause`), ctx.users.editor)).body.status).toBe("paused");
            expect((await call(ctx, "post", path(`/${automation.uid}/pause`), ctx.users.editor)).status).toBe(400);
            expect((await enroll([ann.uid])).status).toBe(400);
            // Paused: the enrollment waits.
            await run("automations");
            const waiting = await enrollmentOf(automation.uid, ann.uid);
            expect(waiting).toMatchObject({ state: "active", currentNodeId: "d" });
            expect(waiting.waitFor ?? null).toBeNull();
            expect(new Date(waiting.nextRunAt).getTime()).toBeGreaterThan(Date.now() + 30_000);
            expect((await call(ctx, "post", path(`/${automation.uid}/resume`), ctx.users.editor)).body.status).toBe("active");
            await due(waiting);
            await run("automations");
            const delayed = await enrollmentOf(automation.uid, ann.uid);
            expect(delayed).toMatchObject({ state: "active", waitFor: { nodeId: "d" } });
            await due(delayed);
            await run("automations");
            expect(await enrollmentOf(automation.uid, ann.uid)).toMatchObject({ state: "completed" });
            // Finished: may enter again.
            expect((await enroll([ann.uid])).body).toEqual({ enrolled: 1 });

            const list = (await call(ctx, "post", path(`/${automation.uid}/enrollments`), ctx.users.viewer, { state: "active", contactUid: ann.uid })).body;
            expect(list).toMatchObject({ total: 1, items: [{ email: "ann@x.example", state: "active" }] });
            expect((await call(ctx, "post", path(`/${automation.uid}/enrollments`), ctx.users.viewer)).body.total).toBe(2);
            const exit = (enrollmentUid: string) => call(ctx, "post", path(`/${automation.uid}/enrollments/${enrollmentUid}/exit`), ctx.users.editor);
            expect((await exit(list.items[0].uid)).body).toMatchObject({ state: "exited", error: "Taken out by a member." });
            expect((await exit(list.items[0].uid)).status).toBe(400);
            expect((await exit("nope")).status).toBe(404);
        });

        it("runs every kind of step", async () => {
            const vip = (await call(ctx, "post", `/lists/${workspaceUid}`, ctx.users.owner, { name: "VIP" })).body.uid;
            const target = await published(chain(trigger({ event: "manual", listUid: undefined }), { id: "x", type: "exit" }));
            const graph = {
                nodes: [
                    trigger({ event: "contact.created", listUid: undefined }),
                    { id: "cond", type: "condition", config: { filter: { field: "tags", op: "eq", value: "vip" } } },
                    { id: "stage", type: "set_field", config: { field: "lifecycleStage", value: "customer" } },
                    { id: "tag", type: "add_tag", config: { tag: "Welcomed" } },
                    { id: "untag", type: "remove_tag", config: { tag: "vip" } },
                    { id: "sub", type: "subscribe", config: { listUid: vip } },
                    { id: "unsub", type: "unsubscribe", config: { listUid: vip } },
                    { id: "task", type: "create_task", config: { title: "Call them", dueInDays: 2, assigneeUserUid: ctx.users.editor.uid } },
                    { id: "task2", type: "create_task", config: { title: "Follow up" } },
                    { id: "notify", type: "notify", config: { userUid: ctx.users.owner.uid, message: "New VIP" } },
                    { id: "enroll", type: "enroll", config: { automationUid: target.uid } },
                    { id: "split", type: "split", config: { percent: 99 } },
                    { id: "end", type: "exit" },
                    { id: "notvip", type: "add_tag", config: { tag: "regular" } },
                ],
                edges: [
                    { from: "t", to: "cond" },
                    { from: "cond", to: "stage", port: "yes" },
                    { from: "cond", to: "notvip", port: "no" },
                    { from: "stage", to: "tag" },
                    { from: "tag", to: "untag" },
                    { from: "untag", to: "sub" },
                    { from: "sub", to: "unsub" },
                    { from: "unsub", to: "task" },
                    { from: "task", to: "task2" },
                    { from: "task2", to: "notify" },
                    { from: "notify", to: "enroll" },
                    { from: "enroll", to: "split" },
                    { from: "split", to: "end", port: "a" },
                    { from: "split", to: "end", port: "b" },
                ],
            };
            const automation = await published(graph);
            const ann = await contact("ann@x.example", { tags: ["vip"] });
            const bob = await contact("bob@x.example");
            await turn();
            expect(await enrollmentOf(automation.uid, ann.uid)).toMatchObject({ state: "completed" });
            const annRow = await (await ctx.repo("contact")).findOne(ann.uid, { ignoreACL: true, skipCache: true });
            expect(annRow).toMatchObject({ lifecycleStage: "customer", tags: ["welcomed"] });
            expect(await tagsOf(bob.uid)).toEqual(["regular"]);
            const subscriptions = (await call(ctx, "get", `/subscriptions/${workspaceUid}?contactUid=${ann.uid}`, ctx.users.viewer)).body;
            expect(subscriptions.map((entry: any) => entry.status)).toEqual(["unsubscribed"]);
            const tasks = (await call(ctx, "get", `/tasks/${workspaceUid}`, ctx.users.viewer)).body.map((task: any) => [task.title, task.subjectUid, task.assigneeUserUid ?? null]);
            expect(tasks.sort()).toEqual([
                ["Call them", ann.uid, ctx.users.editor.uid],
                ["Follow up", ann.uid, null],
            ]);
            expect(ctx.pushed().some((push) => push.type === "CrmAutomationNotice" && push.uids.includes(ctx.users.owner.uid) && push.data.message === "New VIP")).toBe(true);
            expect(await enrollmentOf(target.uid, ann.uid)).toBeTruthy();
            // Tagging a contact twice changes nothing; removing a tag they don't have neither.
            const history = (await enrollmentOf(automation.uid, ann.uid)).history.map((step: any) => `${step.nodeId}:${step.outcome}`);
            expect(history).toEqual(expect.arrayContaining(["cond:yes", "enroll:enrolled", "end:exit"]));
        });

        it("filters triggers by contact and changed field, enters segment members, and reaches goals", async () => {
            const byField = await published(chain(trigger({ event: "contact.updated", listUid: undefined, fields: ["leadStatus"] }), { id: "tag", type: "add_tag", config: { tag: "status-changed" } }));
            const byFilter = await published(chain(trigger({ filter: { field: "email", op: "contains", value: "vip" } }), { id: "tag", type: "add_tag", config: { tag: "vip-welcomed" } }));
            const segmentUid = (await call(ctx, "post", `/segments/${workspaceUid}`, ctx.users.editor, { name: "Big", filter: { field: "score", op: "gt", value: 50 } })).body.uid;
            const bySegment = await published(chain(trigger({ event: "segment.entered", listUid: undefined, segmentUid }), { id: "tag", type: "add_tag", config: { tag: "big" } }));
            const withGoal = await published(
                chain(trigger({ event: "form.submitted", listUid: undefined }), { id: "wait", type: "delay", config: { amount: 1, unit: "days" } }, { id: "tag", type: "add_tag", config: { tag: "never" } }),
                { goalFilter: { field: "lifecycleStage", op: "eq", value: "customer" } },
            );
            const ann = await contact("ann-vip@x.example");
            const bob = await contact("bob@x.example");
            await subscribe(ann.uid);
            await subscribe(bob.uid);
            await call(ctx, "put", `/contacts/${workspaceUid}/${bob.uid}`, ctx.users.editor, { firstName: "Robert" });
            await turn();
            expect(await enrollmentOf(byField.uid, bob.uid)).toBeUndefined();
            await call(ctx, "put", `/contacts/${workspaceUid}/${bob.uid}`, ctx.users.editor, { leadStatus: "hot" });
            await turn();
            expect(await tagsOf(bob.uid)).toEqual(["status-changed"]);
            expect(await enrollmentOf(byFilter.uid, bob.uid)).toBeUndefined();
            expect(await tagsOf(ann.uid)).toEqual(["vip-welcomed"]);

            // Bob's score rises; the next refresh of the segment puts him in, and the automation enters him.
            const row = await (await ctx.repo("contact")).findOne(bob.uid, { ignoreACL: true, skipCache: true });
            await (await ctx.repo("contact")).update({ uid: bob.uid, version: row.version, score: 60 }, row, { ignoreACL: true });
            const segments = await ctx.job("segments");
            segments.refreshSeconds = 0;
            await segments.run();
            await turn();
            expect(await tagsOf(bob.uid)).toEqual(expect.arrayContaining(["big"]));
            expect(await enrollmentOf(bySegment.uid, bob.uid)).toMatchObject({ state: "completed" });
            // Leaving (by a refresh done by hand) records an event too.
            const again = await (await ctx.repo("contact")).findOne(bob.uid, { ignoreACL: true, skipCache: true });
            await (await ctx.repo("contact")).update({ uid: bob.uid, version: again.version, score: 0 }, again, { ignoreACL: true });
            await call(ctx, "post", `/segments/${workspaceUid}/${segmentUid}/refresh`, ctx.users.editor);
            const left = await (await ctx.repo("crmEvent")).find({ contactUid: bob.uid, type: "segment.left" }, { ignoreACL: true, limit: 5 });
            expect(left).toHaveLength(1);

            // A goal reached takes the contact out before the next step.
            const form = await call(ctx, "post", `/forms/${workspaceUid}`, ctx.users.owner, { name: "Signup", listUids: [listUid], doubleOptIn: false });
            expect(form.body.message).toBeUndefined();
            const formUid = form.body.uid;
            const submitted = await call(ctx, "post", `/public/forms/${formUid}`, null, { values: { email: "cat@x.example" } });
            expect(submitted.status).toBe(200);
            await turn();
            const cat = (await (await ctx.repo("contact")).find({ email: "cat@x.example" }, { ignoreACL: true, limit: 1 }))[0];
            const catIn = await enrollmentOf(withGoal.uid, cat.uid);
            expect(catIn).toMatchObject({ state: "active", currentNodeId: "wait" });
            await call(ctx, "put", `/contacts/${workspaceUid}/${cat.uid}`, ctx.users.editor, { lifecycleStage: "customer" });
            await due(catIn);
            await turn();
            expect(await enrollmentOf(withGoal.uid, cat.uid)).toMatchObject({ state: "completed" });
            expect(await tagsOf(cat.uid)).toEqual([]);
        });

        it("waits on an email that was opened or clicked already, and on one never sent", async () => {
            const graph = (event: string) => ({
                nodes: [
                    trigger(),
                    { id: "send", type: "send_email", config: { templateUid: welcomeUid, senderUid } },
                    { id: "delay", type: "delay", config: { amount: 1, unit: "minutes" } },
                    { id: "wait", type: "wait", config: { event, sendNodeId: "send", timeoutAmount: 1, timeoutUnit: "hours" } },
                    { id: "yes", type: "add_tag", config: { tag: `${event}-yes` } },
                    { id: "no", type: "add_tag", config: { tag: `${event}-no` } },
                ],
                edges: [
                    { from: "t", to: "send" },
                    { from: "send", to: "delay" },
                    { from: "delay", to: "wait" },
                    { from: "wait", to: "yes", port: "matched" },
                    { from: "wait", to: "no", port: "timeout" },
                ],
            });
            const opened = await published(graph("email.opened"));
            const clicked = await published(graph("email.clicked"));
            const ann = await contact("ann@x.example");
            await subscribe(ann.uid);
            await turn();
            await run("send");
            // Ann opens and clicks both emails during the delay.
            const sends = await (await ctx.repo("outboundSend")).find({ contactUid: ann.uid }, { ignoreACL: true, limit: 5 });
            const { EngagementRecorder } = await import("../../src/sending/Engagement.js");
            const route = ctx.route("AutomationRoute");
            const recorder = new EngagementRecorder(route.repos(), route.classes, undefined);
            for (const send of sends) {
                const clickedSend = await recorder.record(send, "clicked", { url: "https://x" });
                await recorder.record(clickedSend, "opened", {});
            }
            for (const automation of [opened, clicked]) {
                await due(await enrollmentOf(automation.uid, ann.uid));
            }
            await turn();
            expect((await tagsOf(ann.uid)).sort()).toEqual(["email.clicked-yes", "email.opened-yes"]);

            // Bob's email is never sent (he's suppressed): his wait times out.
            const bob = await contact("bob@x.example");
            await call(ctx, "post", `/suppressions/${workspaceUid}`, ctx.users.owner, { email: "bob@x.example" });
            await subscribe(bob.uid);
            await turn();
            await run("send");
            await due(await enrollmentOf(opened.uid, bob.uid));
            await turn();
            const waiting = await enrollmentOf(opened.uid, bob.uid);
            expect(waiting).toMatchObject({ state: "waiting" });
            expect(waiting.waitFor.sendUid).toBeTruthy();
            await due(waiting);
            await turn();
            expect(await tagsOf(bob.uid)).toEqual(expect.arrayContaining(["email.opened-no"]));
        });

        it("ends runs whose contact or automation is gone, fails a step that can't run, and stops runaway loops", async () => {
            const automation = await published(chain(trigger({ event: "manual", listUid: undefined }), { id: "d", type: "delay", config: { amount: 1, unit: "minutes" } }, { id: "s", type: "set_field", config: { field: "ownerUserUid", value: "not-a-member" } }));
            const ann = await contact("ann@x.example");
            const bob = await contact("bob@x.example");
            await call(ctx, "post", path(`/${automation.uid}/enroll`), ctx.users.editor, { contactUids: [ann.uid, bob.uid] });
            await turn();
            for (const person of [ann, bob]) {
                await due(await enrollmentOf(automation.uid, person.uid));
            }
            // Ann's contact is deleted behind the API's back (the API would delete her runs too).
            await (await ctx.repo("contact")).delete(ann.uid, { ignoreACL: true, purge: true });
            await turn();
            expect(await enrollmentOf(automation.uid, ann.uid)).toMatchObject({ state: "exited", error: "The contact was deleted." });
            expect(await enrollmentOf(automation.uid, bob.uid)).toMatchObject({ state: "failed" });
            expect((await enrollmentOf(automation.uid, bob.uid)).error).toMatch(/Step s failed/);

            const other = await published(chain(trigger({ event: "manual", listUid: undefined }), { id: "d", type: "delay", config: { amount: 1, unit: "minutes" } }));
            await call(ctx, "post", path(`/${other.uid}/enroll`), ctx.users.editor, { contactUids: [bob.uid] });
            await turn();
            await due(await enrollmentOf(other.uid, bob.uid));
            await (await ctx.repo("automation")).delete(other.uid, { ignoreACL: true, purge: true });
            await turn();
            expect(await enrollmentOf(other.uid, bob.uid)).toMatchObject({ state: "exited", error: "The automation was deleted." });

            // A contact that has taken too many steps is stopped.
            const looping = await published({
                nodes: [trigger({ event: "manual", listUid: undefined }), { id: "d", type: "delay", config: { amount: 1, unit: "minutes" } }, { id: "tag", type: "add_tag", config: { tag: "loop" } }],
                edges: [{ from: "t", to: "d" }, { from: "d", to: "tag" }, { from: "tag", to: "d" }],
            });
            await call(ctx, "post", path(`/${looping.uid}/enroll`), ctx.users.editor, { contactUids: [bob.uid] });
            const enrollment = await enrollmentOf(looping.uid, bob.uid);
            const repo = await ctx.repo("enrollment");
            await repo.update({ uid: enrollment.uid, version: enrollment.version, steps: 1000 }, enrollment, { ignoreACL: true });
            await turn();
            expect(await enrollmentOf(looping.uid, bob.uid)).toMatchObject({ state: "failed", error: expect.stringMatching(/Gave up after 1000 steps/) });

            // Deleting the contact through the API deletes its runs and events; deleting an automation its versions and runs.
            expect((await call(ctx, "delete", `/contacts/${workspaceUid}/${bob.uid}`, ctx.users.editor)).status).toBe(204);
            expect(await enrollmentOf(looping.uid, bob.uid)).toBeUndefined();
            expect((await call(ctx, "delete", path(`/${looping.uid}`), ctx.users.editor)).status).toBe(204);
            expect(await (await ctx.repo("automationVersion")).find({ automationUid: looping.uid }, { ignoreACL: true, limit: 5 })).toEqual([]);
        });

        it("hands each event over once, prunes old ones, and survives failures", async () => {
            const automation = await published(chain(trigger(), { id: "tag", type: "add_tag", config: { tag: "in" } }));
            const ann = await contact("ann@x.example");
            await subscribe(ann.uid);
            const triggers = await ctx.job("triggers");
            expect(triggers.schedule).toBe("*/5 * * * * *");
            expect((await ctx.job("automations")).schedule).toBe("*/5 * * * * *");
            const events = await ctx.repo("crmEvent");
            vi.spyOn(events, "update").mockRejectedValueOnce(new Error("version mismatch")).mockRejectedValueOnce(new Error("disk full"));
            await triggers.run();
            vi.restoreAllMocks();
            await triggers.run();
            await triggers.run();
            expect(await (await ctx.repo("enrollment")).find({ automationUid: automation.uid }, { ignoreACL: true, limit: 5 })).toHaveLength(1);
            const dispatched = await events.find({ contactUid: ann.uid }, { ignoreACL: true, limit: 50 });
            expect(dispatched.every((event: any) => event.dispatchedAt)).toBe(true);
            triggers.retentionDays = -1;
            await triggers.run();
            expect(await events.find({ contactUid: ann.uid }, { ignoreACL: true, limit: 50 })).toEqual([]);

            // A lost race on an enrollment is quiet; any other failure is logged, and the run goes on.
            const enrollments = await ctx.repo("enrollment");
            const runner = await ctx.job("automations");
            vi.spyOn(enrollments, "update").mockRejectedValueOnce(new Error("version mismatch"));
            await runner.run();
            vi.spyOn(enrollments, "update").mockRejectedValueOnce(new Error("disk full"));
            await runner.run();
            vi.restoreAllMocks();
            await runner.run();
            expect(await tagsOf(ann.uid)).toEqual(["in"]);
            expect((await enrollmentOf(automation.uid, ann.uid)).state).toBe("completed");
            // An event about a message nobody waits on resumes nothing.
            const { AutomationEngine } = await import("../../src/automation/Engine.js");
            const engine = new AutomationEngine({ repos: runner.repos(), classes: runner.classes });
            expect(await engine.resumeWaiting({ type: "email.opened", contactUid: ann.uid, data: {} })).toBe(0);
        });

        it("resumes a wait whose step has nowhere to go, and leaves a wait someone else holds", async () => {
            const automation = await published({
                nodes: [
                    trigger(),
                    { id: "send", type: "send_email", config: { templateUid: welcomeUid, senderUid } },
                    { id: "wait", type: "wait", config: { event: "email.replied", sendNodeId: "send", timeoutAmount: 1, timeoutUnit: "minutes" } },
                ],
                edges: [
                    { from: "t", to: "send" },
                    { from: "send", to: "wait" },
                ],
            });
            const ann = await contact("ann@x.example");
            await subscribe(ann.uid);
            await turn();
            const waiting = await enrollmentOf(automation.uid, ann.uid);
            const { AutomationEngine } = await import("../../src/automation/Engine.js");
            const route = ctx.route("AutomationRoute");
            const engine = new AutomationEngine({ repos: route.repos(), classes: route.classes });
            const event = { type: "email.replied", contactUid: ann.uid, data: { sendUid: waiting.waitFor.sendUid } };
            // Leased by a run: left alone.
            const repo = await ctx.repo("enrollment");
            const leased = await repo.update({ uid: waiting.uid, version: waiting.version, leaseExpiresAt: new Date(Date.now() + 60_000) }, waiting, { ignoreACL: true });
            expect(await engine.resumeWaiting(event)).toBe(0);
            const free = await repo.update({ uid: leased.uid, version: leased.version, leaseExpiresAt: null }, leased, { ignoreACL: true });
            expect(await engine.resumeWaiting({ ...event, type: "email.opened" })).toBe(0);
            vi.spyOn(repo, "update").mockRejectedValueOnce(new Error("version mismatch"));
            expect(await engine.resumeWaiting(event)).toBe(0);
            vi.restoreAllMocks();
            expect(await engine.resumeWaiting(event)).toBe(1);
            expect(free).toBeTruthy();
            await turn();
            expect(await enrollmentOf(automation.uid, ann.uid)).toMatchObject({ state: "completed" });
        });
    });
}
