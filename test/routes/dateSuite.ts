///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Date-triggered automations: birthdays, renewals, anniversaries and "N days after" - identical on both backends.
import { dayOf } from "../../src/automation/Dates.js";
import { MAX_DATE_SCAN } from "../../src/jobs/DateTriggerJob.js";
import { CrmTestContext, call, setUpWorkspace } from "./context.js";

export function dateSuite(ctx: CrmTestContext): void {
    describe("date-triggered automations", () => {
        let workspaceUid: string;
        const path = (suffix: string = "") => `/automations/${workspaceUid}${suffix}`;
        const contact = async (email: string, extra: Record<string, unknown> = {}) => (await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email, ...extra })).body;
        const graph = (trigger: Record<string, unknown>) => ({
            nodes: [
                { id: "t", type: "trigger", config: { event: "date.reached", ...trigger } },
                { id: "x", type: "exit" },
            ],
            edges: [{ from: "t", to: "x", port: "next" }],
        });
        const create = async (trigger: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
            (await call(ctx, "post", path(), ctx.users.editor, { name: "Dates", graph: graph(trigger), reentry: "after_exit", ...extra })).body;
        const publish = async (uid: string) => await call(ctx, "post", path(`/${uid}/publish`), ctx.users.editor);
        const published = async (trigger: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
            const created = await create(trigger, extra);
            const result = await publish(created.uid);
            expect(result.body.message).toBeUndefined();
            return result.body;
        };
        /** The emails of the contacts in `automationUid`, and how often each went in. */
        const enrolled = async (automationUid: string) => {
            const rows = await (await ctx.repo("enrollment")).find({ automationUid }, { ignoreACL: true, limit: 100, skipCache: true });
            const emails: string[] = [];
            for (const row of rows) {
                emails.push((await (await ctx.repo("contact")).findOne(row.contactUid, { ignoreACL: true })).email);
            }
            return emails.sort();
        };
        /** Runs the date job at `iso`, then moves everyone through (so `after_exit` lets them in again). */
        const runAt = async (iso: string) => {
            await (await ctx.job("dates")).run(new Date(iso));
            await (await ctx.job("automations")).run();
        };
        const change = async (model: string, uid: string, fields: Record<string, unknown>) => {
            const repo = await ctx.repo(model);
            const row = await repo.findOne(uid, { ignoreACL: true, skipCache: true });
            await repo.update({ uid, version: row.version, ...fields }, row, { ignoreACL: true });
        };

        beforeEach(async () => {
            workspaceUid = await setUpWorkspace(ctx);
            for (const definition of [
                { objectType: "contact", key: "birthday", label: "Birthday", type: "date" },
                { objectType: "contact", key: "renewal", label: "Renewal", type: "date" },
                { objectType: "contact", key: "plan", label: "Plan", type: "text" },
            ]) {
                expect((await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, definition)).status).toBe(200);
            }
        });

        it("refuses date triggers it can't run", async () => {
            for (const [trigger, message] of [
                [{}, /choose the date/],
                [{ dateField: "email" }, /choose the date/],
                [{ dateField: "dateCreated", offsetDays: 400 }, /offsetDays/],
                [{ dateField: "dateCreated", repeat: "weekly" }, /repeat/],
                [{ dateField: "dateCreated", hour: 25 }, /hour/],
                [{ dateField: "properties.plan" }, /'plan' isn't one/],
                [{ dateField: "properties.nothing" }, /'nothing' isn't one/],
            ] as const) {
                const result = await publish((await create(trigger)).uid);
                expect({ trigger, status: result.status }).toEqual({ trigger, status: 400 });
                expect(result.body.message).toMatch(message);
            }
            expect((await published({ dateField: "properties.birthday" })).status).toBe("active");
            expect((await published({ dateField: "lastEngagedAt", offsetDays: 30, repeat: "once", hour: 0 })).status).toBe("active");
        });

        it("puts contacts in on their birthday each year, from the trigger's hour, once a day", async () => {
            await contact("ann@x.example", { properties: { birthday: "1990-10-01T00:00:00.000Z" } });
            await contact("bob@x.example", { properties: { birthday: "1985-10-02T00:00:00.000Z" } });
            await contact("cat@x.example");
            await contact("dan@x.example", { properties: { birthday: "2000-02-29T00:00:00.000Z" } });
            const automation = await published({ dateField: "properties.birthday", hour: 9 });

            await runAt("2026-10-01T08:59:00Z");
            expect(await enrolled(automation.uid)).toEqual([]);
            await runAt("2026-10-01T09:00:00Z");
            expect(await enrolled(automation.uid)).toEqual(["ann@x.example"]);
            expect((await (await ctx.repo("automation")).findOne(automation.uid, { ignoreACL: true, skipCache: true })).dateCheckedOn).toBe("2026-10-01");
            // Once a day, however often the job runs - even though ann has finished and may come back.
            await runAt("2026-10-01T15:00:00Z");
            expect(await enrolled(automation.uid)).toEqual(["ann@x.example"]);
            await runAt("2026-10-02T09:30:00Z");
            expect(await enrolled(automation.uid)).toEqual(["ann@x.example", "bob@x.example"]);
            // A 29 February birthday comes round on the 28th in other years.
            await runAt("2027-02-28T10:00:00Z");
            expect(await enrolled(automation.uid)).toContain("dan@x.example");
            await runAt("2027-10-01T10:00:00Z");
            expect((await enrolled(automation.uid)).filter((email) => email === "ann@x.example")).toHaveLength(2);

            const timeline = (await call(ctx, "get", `/timeline/${workspaceUid}/contact/${(await contact("eve@x.example")).uid}`, ctx.users.viewer)).body;
            expect(timeline.some((entry: any) => entry.kind === "automation_entered")).toBe(false);
        });

        it("fires days before a one-off date, in the workspace's time zone, for contacts matching the filter", async () => {
            await call(ctx, "put", `/workspaces/${workspaceUid}`, ctx.users.owner, { timezone: "America/Los_Angeles" });
            await contact("ann@x.example", { tags: ["vip"], properties: { renewal: "2026-10-08T00:00:00.000Z" } });
            await contact("bob@x.example", { properties: { renewal: "2026-10-08T00:00:00.000Z" } });
            await contact("cat@x.example", { tags: ["vip"], properties: { renewal: "2027-10-08T00:00:00.000Z" } });
            const automation = await published({ dateField: "properties.renewal", offsetDays: -7, repeat: "once", hour: 8, filter: { field: "tags", op: "eq", value: "vip" } });

            // 14:00 UTC is 07:00 in Los Angeles: too early. 16:00 UTC is 09:00 there.
            await runAt("2026-10-01T14:00:00Z");
            expect(await enrolled(automation.uid)).toEqual([]);
            await runAt("2026-10-01T16:00:00Z");
            expect(await enrolled(automation.uid)).toEqual(["ann@x.example"]);
            // The next year it doesn't come back.
            await runAt("2027-10-01T16:00:00Z");
            expect(await enrolled(automation.uid)).toEqual(["ann@x.example", "cat@x.example"]);
        });

        it("fires after a contact's own dates, taking the day in the workspace's time zone", async () => {
            await call(ctx, "put", `/workspaces/${workspaceUid}`, ctx.users.owner, { timezone: "America/Los_Angeles" });
            const ann = await contact("ann@x.example");
            const bob = await contact("bob@x.example");
            const cat = await contact("cat@x.example");
            // 03:00 UTC on 2 September is still 1 September in Los Angeles.
            await change("contact", ann.uid, { lastEngagedAt: new Date("2026-09-02T03:00:00Z") });
            await change("contact", bob.uid, { lastEngagedAt: new Date("2026-09-02T12:00:00Z") });
            const lapsed = await published({ dateField: "lastEngagedAt", offsetDays: 30, repeat: "once" });
            await runAt("2026-10-01T17:00:00Z");
            expect(await enrolled(lapsed.uid)).toEqual(["ann@x.example"]);

            // A signup anniversary: the day cat was created (in Los Angeles), a year on - at 20:00 UTC, midday there.
            const created: string = dayOf((await (await ctx.repo("contact")).findOne(cat.uid, { ignoreACL: true })).dateCreated, "dateCreated", "America/Los_Angeles");
            const anniversary = await published({ dateField: "dateCreated" });
            await runAt(`${created}T20:00:00Z`);
            expect(await enrolled(anniversary.uid)).toEqual([]);
            await runAt(`${Number(created.slice(0, 4)) + 1}${created.slice(4)}T20:00:00Z`);
            expect(await enrolled(anniversary.uid)).toEqual(["ann@x.example", "bob@x.example", "cat@x.example"]);
        });

        it("skips paused, draft and other automations, and workspaces with an unknown time zone fall back to UTC", async () => {
            await contact("ann@x.example", { properties: { birthday: "1990-10-01T00:00:00.000Z" } });
            const paused = await published({ dateField: "properties.birthday" });
            await call(ctx, "post", path(`/${paused.uid}/pause`), ctx.users.editor);
            const draft = await create({ dateField: "properties.birthday" });
            const manual = (await call(ctx, "post", path(), ctx.users.editor, { name: "Manual", graph: { ...graph({}), nodes: [{ id: "t", type: "trigger", config: { event: "manual" } }, { id: "x", type: "exit" }] } })).body;
            await publish(manual.uid);
            await change("workspace", workspaceUid, { timezone: "Not/AZone" });
            const live = await published({ dateField: "properties.birthday" });
            // An active automation left without its version is skipped.
            const orphan = await published({ dateField: "properties.birthday" });
            await (await ctx.repo("automationVersion")).delete(orphan.publishedVersionUid, { ignoreACL: true });
            await runAt("2026-10-01T09:00:00Z");
            expect(await enrolled(paused.uid)).toEqual([]);
            expect(await enrolled(draft.uid)).toEqual([]);
            expect(await enrolled(manual.uid)).toEqual([]);
            expect(await enrolled(orphan.uid)).toEqual([]);
            expect(await enrolled(live.uid)).toEqual(["ann@x.example"]);
        });

        it("logs failures, but not a lost race for the day, and reads big workspaces in pages", async () => {
            await contact("ann@x.example", { properties: { birthday: "1990-10-01T00:00:00.000Z" } });
            const automation = await published({ dateField: "properties.birthday" });
            for (const [message, logged] of [
                ["disk full", 1],
                ["version mismatch", 0],
            ] as const) {
                const job = await ctx.job("dates");
                const error = vi.fn();
                job.logger = { error, info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
                const repoOf = job.repo.bind(job);
                job.repo = async (name: string) => {
                    const repo = await repoOf(name);
                    return name === "automation" ? { find: repo.find.bind(repo), update: async () => await Promise.reject(new Error(message)) } : repo;
                };
                await job.run(new Date("2026-10-01T10:00:00Z"));
                expect(error).toHaveBeenCalledTimes(logged);
            }
            const quiet = await ctx.job("dates");
            quiet.logger = undefined;
            const repoOf = quiet.repo.bind(quiet);
            quiet.repo = async (name: string) => {
                const repo = await repoOf(name);
                return name === "automation" ? { find: repo.find.bind(repo), update: async () => await Promise.reject("odd") } : repo;
            };
            await quiet.run(new Date("2026-10-01T10:00:00Z"));
            expect(await enrolled(automation.uid)).toEqual([]);

            // Full pages are read on to the next, of automations and of dates.
            const job = await ctx.job("dates");
            const pages: number[] = [];
            const fake = (size: number) => ({
                find: async () => {
                    pages.push(size);
                    return pages.length === 1 ? Array.from({ length: size }, (_value, index) => ({ uid: `a${index}`, status: "active" })) : [];
                },
            });
            job.repo = async () => fake(1000);
            await job.run(new Date("2026-10-01T10:00:00Z"));
            expect(pages).toEqual([1000, 1000]);
            let reads: number = 0;
            const rows = await job.all(
                {
                    find: async () => {
                        reads++;
                        return Array.from({ length: 1000 }, (_value, index) => ({ uid: `r${reads}-${index}` }));
                    },
                },
                {},
            );
            expect(rows).toHaveLength(MAX_DATE_SCAN);
            expect(job.schedule).toBe("20 * * * * *");
        });
    });
}
