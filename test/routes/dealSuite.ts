///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Pipelines, deals, the forecast, deal-triggered automations, task reminders and logged 1:1 email - identical on both backends.
import { CrmTestContext, call, setUpWorkspace } from "./context.js";

export function dealSuite(ctx: CrmTestContext): void {
    describe("pipelines and deals", () => {
        let workspaceUid: string;
        const pipelinesPath = (suffix: string = "") => `/pipelines/${workspaceUid}${suffix}`;
        const dealsPath = (suffix: string = "") => `/deals/${workspaceUid}${suffix}`;
        const contact = async (email: string) => (await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email })).body;
        const defaultPipeline = async () => (await call(ctx, "get", pipelinesPath(), ctx.users.viewer)).body[0];
        const stageNamed = (pipeline: any, name: string) => pipeline.stages.find((stage: any) => stage.name === name).id;

        beforeEach(async () => {
            workspaceUid = await setUpWorkspace(ctx);
        });

        it("gives a workspace a default pipeline, and manages pipelines and their stages", async () => {
            const sales = await defaultPipeline();
            expect(sales).toMatchObject({ name: "Sales", isDefault: true });
            expect(sales.stages.map((stage: any) => [stage.name, stage.probability, stage.kind])).toEqual([
                ["Qualified", 10, "open"],
                ["Meeting booked", 30, "open"],
                ["Proposal sent", 60, "open"],
                ["Negotiation", 80, "open"],
                ["Won", 100, "won"],
                ["Lost", 0, "lost"],
            ]);
            expect((await call(ctx, "get", pipelinesPath(), ctx.users.viewer)).body).toHaveLength(1);
            expect((await call(ctx, "get", `${pipelinesPath()}?page=1`, ctx.users.viewer)).body).toEqual([]);

            expect((await call(ctx, "post", pipelinesPath(), ctx.users.editor, { name: "Partners" })).status).toBe(403);
            for (const stages of [
                "x",
                [{ name: "Only" }],
                [{ name: "A" }, 5],
                [{ name: "A" }, { name: "B", kind: "won" }],
                [{ name: "A", kind: "won" }, { name: "B", kind: "lost" }],
                [{ name: "A", kind: "weird" }, { name: "W", kind: "won" }, { name: "L", kind: "lost" }],
                [{ name: "A", probability: 150 }, { name: "W", kind: "won" }, { name: "L", kind: "lost" }],
                [{ name: "A", rottingDays: 0 }, { name: "W", kind: "won" }, { name: "L", kind: "lost" }],
                [{ name: "" }, { name: "W", kind: "won" }, { name: "L", kind: "lost" }],
            ]) {
                expect({ stages, status: (await call(ctx, "post", pipelinesPath(), ctx.users.owner, { name: "Bad", stages })).status }).toEqual({ stages, status: 400 });
            }
            const partners = (
                await call(ctx, "post", pipelinesPath(), ctx.users.owner, {
                    name: "Partners",
                    stages: [{ name: "Intro", rottingDays: 14 }, { name: "Signed", kind: "won" }, { name: "Dropped", kind: "lost" }],
                })
            ).body;
            expect(partners).toMatchObject({ isDefault: false, stages: [{ name: "Intro", probability: 50, rottingDays: 14 }, { probability: 100 }, { probability: 0 }] });

            // Rename a stage, add one, drop one: ids of the kept stages stay; repeated ids are refused.
            const [intro, signed, dropped] = partners.stages;
            const changed = await call(ctx, "put", pipelinesPath(`/${partners.uid}`), ctx.users.owner, {
                name: "Partner deals",
                stages: [{ ...intro, name: "Introduced" }, { name: "Trial" }, signed, dropped],
            });
            expect(changed.body.stages.map((stage: any) => stage.name)).toEqual(["Introduced", "Trial", "Signed", "Dropped"]);
            expect(changed.body.stages[0].id).toBe(intro.id);
            expect((await call(ctx, "put", pipelinesPath(`/${partners.uid}`), ctx.users.owner, { stages: [intro, intro, signed, dropped] })).status).toBe(400);
            expect((await call(ctx, "put", pipelinesPath(`/${partners.uid}`), ctx.users.owner, { name: null })).status).toBe(400);

            // Making it the default takes over from Sales; the default can't be deleted.
            await call(ctx, "put", pipelinesPath(`/${partners.uid}`), ctx.users.owner, { isDefault: true });
            expect((await call(ctx, "get", pipelinesPath(`/${sales.uid}`), ctx.users.viewer)).body.isDefault).toBe(false);
            expect((await call(ctx, "delete", pipelinesPath(`/${partners.uid}`), ctx.users.owner)).body.message).toMatch(/Make another pipeline the default/);
            expect((await call(ctx, "delete", pipelinesPath(`/${sales.uid}`), ctx.users.owner)).status).toBe(204);
        });

        it("creates deals and moves them through stages, keeping their history, timeline and status", async () => {
            const pipeline = await defaultPipeline();
            const ann = await contact("ann@x.example");
            const bob = await contact("bob@x.example");
            const company = (await call(ctx, "post", `/companies/${workspaceUid}`, ctx.users.editor, { name: "Acme" })).body;
            for (const body of [
                { amount: 5 },
                { name: "x", pipelineUid: "nope" },
                { name: "x", stageId: "nope" },
                { name: "x", amount: -1 },
                { name: "x", currency: "dollars" },
                { name: "x", ownerUserUid: "nobody" },
                { name: "x", contactUids: "x" },
                { name: "x", contactUids: ["nope"] },
                { name: "x", companyUid: "nope" },
                { name: "x", expectedCloseDate: "someday" },
            ]) {
                expect({ body, status: (await call(ctx, "post", dealsPath(), ctx.users.editor, body)).status }).toEqual({ body, status: 400 });
            }
            const created = await call(ctx, "post", dealsPath(), ctx.users.editor, {
                name: "Acme renewal",
                amount: 12000,
                currency: "eur",
                ownerUserUid: ctx.users.editor.uid,
                contactUids: [ann.uid, ann.uid],
                companyUid: company.uid,
                expectedCloseDate: "2026-12-01T00:00:00.000Z",
            });
            expect(created.body).toMatchObject({ amount: 12000, currency: "EUR", pipelineUid: pipeline.uid, stageId: pipeline.stages[0].id, status: "open", contactUids: [ann.uid] });
            const uid: string = created.body.uid;
            const move = (stageName: string, extra: Record<string, unknown> = {}) =>
                call(ctx, "put", dealsPath(`/${uid}`), ctx.users.editor, { stageId: stageNamed(pipeline, stageName), ...extra });

            await move("Proposal sent");
            const lost = await move("Lost", { lostReason: "Too pricey" });
            expect(lost.body).toMatchObject({ status: "lost", lostReason: "Too pricey" });
            expect(lost.body.closedAt).toBeTruthy();
            const won = await move("Won", { contactUids: [ann.uid, bob.uid], companyUid: null, ownerUserUid: null, amount: null, currency: "usd", name: "Acme renewal 2027" });
            expect(won.body).toMatchObject({ status: "won", lostReason: null, contactUids: [ann.uid, bob.uid], amount: 0, currency: "USD", name: "Acme renewal 2027" });
            expect(won.body.stageHistory.map((change: any) => change.stageId)).toEqual(["Qualified", "Proposal sent", "Lost", "Won"].map((name) => stageNamed(pipeline, name)));
            // Staying put records nothing; nor do other changes.
            expect((await move("Won")).body.stageHistory).toHaveLength(4);
            expect((await call(ctx, "put", dealsPath(`/${uid}`), ctx.users.editor, { name: null })).status).toBe(400);
            expect((await call(ctx, "put", dealsPath(`/${uid}`), ctx.users.editor, { expectedCloseDate: null })).status).toBe(200);

            // Moved to another pipeline: to its first stage unless one is named.
            const other = (await call(ctx, "post", pipelinesPath(), ctx.users.owner, { name: "Other" })).body;
            const moved = await call(ctx, "put", dealsPath(`/${uid}`), ctx.users.editor, { pipelineUid: other.uid });
            expect(moved.body).toMatchObject({ pipelineUid: other.uid, stageId: other.stages[0].id, status: "open", closedAt: null });

            const dealTimeline = (await call(ctx, "get", `/timeline/${workspaceUid}/deal/${uid}`, ctx.users.viewer)).body.map((entry: any) => entry.summary);
            expect(dealTimeline).toEqual(expect.arrayContaining(['Created the deal "Acme renewal" in Qualified', 'Moved the deal "Acme renewal" to Lost', 'Moved the deal "Acme renewal 2027" to Won']));
            const annTimeline = (await call(ctx, "get", `/timeline/${workspaceUid}/contact/${ann.uid}`, ctx.users.viewer)).body.map((entry: any) => entry.kind);
            expect(annTimeline).toEqual(expect.arrayContaining(["deal_created", "deal_stage_changed", "deal_lost"]));

            // A contact's deals; the board's filters.
            expect((await call(ctx, "get", `${dealsPath()}?contactUid=${bob.uid}`, ctx.users.viewer)).body.map((deal: any) => deal.uid)).toEqual([uid]);
            expect((await call(ctx, "get", `${dealsPath()}?contactUid=${company.uid}`, ctx.users.viewer)).body).toEqual([]);
            expect((await call(ctx, "get", `${dealsPath()}?pipelineUid=${other.uid}&status=open`, ctx.users.viewer)).body).toHaveLength(1);
            expect((await call(ctx, "get", `${dealsPath()}?pipelineUid=${pipeline.uid}`, ctx.users.viewer)).body).toHaveLength(0);

            // Notes and tasks on the deal; the stage the deal is in can't be removed, nor its pipeline deleted.
            expect((await call(ctx, "post", `/notes/${workspaceUid}`, ctx.users.editor, { subjectType: "deal", subjectUid: uid, body: "Call back" })).status).toBe(200);
            const task = (await call(ctx, "post", `/tasks/${workspaceUid}`, ctx.users.editor, { title: "Send contract", subjectType: "deal", subjectUid: uid })).body;
            expect((await call(ctx, "put", pipelinesPath(`/${other.uid}`), ctx.users.owner, { stages: other.stages.slice(1) })).body.message).toMatch(/still has 1 deals/);
            expect((await call(ctx, "delete", pipelinesPath(`/${other.uid}`), ctx.users.owner)).body.message).toMatch(/still has 1 deals/);

            // Deleting Bob takes him off the deal; deleting the deal its notes and timeline, and unlinks its task.
            await call(ctx, "delete", `/contacts/${workspaceUid}/${bob.uid}`, ctx.users.editor);
            expect((await call(ctx, "get", dealsPath(`/${uid}`), ctx.users.viewer)).body.contactUids).toEqual([ann.uid]);
            expect((await call(ctx, "delete", dealsPath(`/${uid}`), ctx.users.editor)).status).toBe(204);
            expect((await call(ctx, "get", `/tasks/${workspaceUid}/${task.uid}`, ctx.users.viewer)).body.subjectUid ?? null).toBeNull();
            expect((await call(ctx, "get", `/notes/${workspaceUid}?subjectUid=${uid}`, ctx.users.viewer)).body).toEqual([]);
            expect((await call(ctx, "get", `${dealsPath()}?contactUid=${ann.uid}`, ctx.users.viewer)).body).toEqual([]);
        });

        it("forecasts a pipeline", async () => {
            const pipeline = await defaultPipeline();
            const deal = async (name: string, amount: number, stage: string) =>
                (await call(ctx, "post", dealsPath(), ctx.users.editor, { name, amount, stageId: stageNamed(pipeline, stage) })).body;
            await deal("A", 1000, "Qualified");
            await deal("B", 2000, "Proposal sent");
            await deal("C", 5000, "Won");
            await deal("D", 500, "Lost");
            const forecast = (await call(ctx, "get", `${dealsPath("/forecast")}?pipelineUid=${pipeline.uid}&days=30`, ctx.users.viewer)).body;
            expect(forecast.open).toEqual({ count: 2, amount: 3000, weighted: 1300 });
            expect(forecast.stages.find((stage: any) => stage.stageId === stageNamed(pipeline, "Proposal sent"))).toEqual({
                stageId: stageNamed(pipeline, "Proposal sent"),
                count: 1,
                amount: 2000,
                weighted: 1200,
            });
            expect(forecast).toMatchObject({ won: { count: 1, amount: 5000 }, lost: { count: 1, amount: 500 }, winRate: 0.5 });
            expect(forecast.averageDaysToWin).toBeGreaterThanOrEqual(0);
            const empty = (await call(ctx, "get", dealsPath("/forecast"), ctx.users.viewer)).body;
            expect(empty.winRate).toBe(0.5);
            const other = (await call(ctx, "post", pipelinesPath(), ctx.users.owner, { name: "Other" })).body;
            const none = (await call(ctx, "get", `${dealsPath("/forecast")}?pipelineUid=${other.uid}`, ctx.users.viewer)).body;
            expect(none).toEqual({ stages: expect.any(Array), open: { count: 0, amount: 0, weighted: 0 }, won: { count: 0, amount: 0 }, lost: { count: 0, amount: 0 } });
            expect((await call(ctx, "get", `${dealsPath("/forecast")}?days=0`, ctx.users.viewer)).status).toBe(400);
        });

        it("triggers automations when deals move", async () => {
            const pipeline = await defaultPipeline();
            const ann = await contact("ann@x.example");
            const automation = (
                await call(ctx, "post", `/automations/${workspaceUid}`, ctx.users.editor, {
                    name: "Won deal",
                    graph: {
                        nodes: [
                            { id: "t", type: "trigger", config: { event: "deal.won", pipelineUid: pipeline.uid } },
                            { id: "stage", type: "set_field", config: { field: "lifecycleStage", value: "customer" } },
                        ],
                        edges: [{ from: "t", to: "stage", port: "next" }],
                    },
                })
            ).body;
            expect((await call(ctx, "post", `/automations/${workspaceUid}/${automation.uid}/publish`, ctx.users.editor)).body.status).toBe("active");
            const deal = (await call(ctx, "post", dealsPath(), ctx.users.editor, { name: "Big one", contactUids: [ann.uid] })).body;
            await call(ctx, "put", dealsPath(`/${deal.uid}`), ctx.users.editor, { stageId: stageNamed(pipeline, "Won") });
            for (let round = 0; round < 2; round++) {
                await (await ctx.job("triggers")).run();
                await (await ctx.job("automations")).run();
            }
            expect((await (await ctx.repo("contact")).findOne(ann.uid, { ignoreACL: true, skipCache: true })).lifecycleStage).toBe("customer");
            const bad = await call(ctx, "put", `/automations/${workspaceUid}/${automation.uid}`, ctx.users.editor, {
                graph: {
                    nodes: [
                        { id: "t", type: "trigger", config: { event: "deal.won", pipelineUid: "nope" } },
                        { id: "x", type: "exit" },
                    ],
                    edges: [{ from: "t", to: "x" }],
                },
            });
            expect(bad.status).toBe(200);
            expect((await call(ctx, "post", `/automations/${workspaceUid}/${automation.uid}/publish`, ctx.users.editor)).body.message).toMatch(/a pipeline/);
        });

        it("reminds assignees of tasks coming due, once, and again after a new due date", async () => {
            const soon: string = new Date(Date.now() + 5 * 60_000).toISOString();
            const task = (await call(ctx, "post", `/tasks/${workspaceUid}`, ctx.users.editor, { title: "Call Ann", dueAt: soon, assigneeUserUid: ctx.users.editor.uid })).body;
            await call(ctx, "post", `/tasks/${workspaceUid}`, ctx.users.editor, { title: "Later", dueAt: new Date(Date.now() + 86_400_000).toISOString(), assigneeUserUid: ctx.users.editor.uid });
            const job = await ctx.job("reminders");
            expect(job.schedule).toBe("15 * * * * *");
            await job.run();
            await job.run();
            const reminders = () => ctx.pushed().filter((push) => push.type === "CrmTaskDue");
            expect(reminders().map((push) => push.data.title)).toEqual(["Call Ann"]);
            expect(reminders()[0]).toMatchObject({ uids: [ctx.users.editor.uid], data: { taskUid: task.uid, title: "Call Ann" } });
            await call(ctx, "put", `/tasks/${workspaceUid}/${task.uid}`, ctx.users.editor, { dueAt: new Date(Date.now() + 60_000).toISOString() });
            await call(ctx, "put", `/tasks/${workspaceUid}/${task.uid}`, ctx.users.editor, { title: "Call Ann now" });
            await job.run();
            expect(reminders()).toHaveLength(2);
            const tasks = await ctx.repo("task");
            vi.spyOn(tasks, "update").mockRejectedValueOnce(new Error("version mismatch")).mockRejectedValueOnce(new Error("disk full"));
            await call(ctx, "post", `/tasks/${workspaceUid}`, ctx.users.editor, { title: "Race", dueAt: soon, assigneeUserUid: ctx.users.editor.uid });
            await call(ctx, "post", `/tasks/${workspaceUid}`, ctx.users.editor, { title: "Fail", dueAt: soon, assigneeUserUid: ctx.users.editor.uid });
            await job.run();
            vi.restoreAllMocks();
            expect(reminders()).toHaveLength(2);
        });

        it("logs mail a logging sender's mailbox exchanges with contacts", async () => {
            await ctx.createMailbox(ctx.users.owner.uid, "sales@acme.example");
            const sender = (await call(ctx, "post", `/workspaces/${workspaceUid}/senders`, ctx.users.owner, { fromAddress: "sales@acme.example", logEmail: true })).body;
            expect(sender.logEmail).toBe(true);
            const ann = await contact("ann@x.example");
            const job = await ctx.job("events");
            const received = { type: "message.delivered", occurredAt: new Date().toISOString(), mailboxUid: "sales@acme.example", messageUid: "m1", envelopeTo: [], references: [], fromAddress: "Ann@x.example", subject: "Pricing" };
            await job.handle(received);
            await job.handle(received);
            await job.handle({ ...received, messageUid: "m2", fromAddress: "stranger@x.example" });
            await job.handleSent({ type: "message.sent", occurredAt: new Date().toISOString(), mailboxUid: "sales@acme.example", messageId: "id1", messageUid: "m3", recipients: ["ann@x.example", "bob@x.example"] });
            await job.handleSent({ type: "message.sent", occurredAt: new Date().toISOString(), messageId: "id2", recipients: ["ann@x.example"] });
            await job.handleSent({ type: "message.sent", occurredAt: new Date().toISOString(), mailboxUid: "sales@acme.example", messageId: "id4", recipients: [] });
            const timeline = (await call(ctx, "get", `/timeline/${workspaceUid}/contact/${ann.uid}`, ctx.users.viewer)).body.map((entry: any) => entry.summary);
            expect(timeline.filter((summary: string) => summary.startsWith("Emailed"))).toEqual(expect.arrayContaining(["Emailed sales@acme.example: Pricing", "Emailed by sales@acme.example"]));
            expect(timeline.filter((summary: string) => summary.startsWith("Emailed"))).toHaveLength(2);

            // Switched off: nothing more is logged.
            expect((await call(ctx, "put", `/workspaces/${workspaceUid}/senders/${sender.uid}`, ctx.users.owner, { logEmail: false })).body.logEmail).toBe(false);
            await job.handle({ ...received, messageUid: "m9", subject: undefined });
            expect((await call(ctx, "get", `/timeline/${workspaceUid}/contact/${ann.uid}`, ctx.users.viewer)).body.filter((entry: any) => entry.summary.startsWith("Emailed"))).toHaveLength(2);
        });
    });
}
