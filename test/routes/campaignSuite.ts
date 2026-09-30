///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Campaigns end to end - drafting, the checklist, scheduling, preparing, sending, tracking, bounces, complaints, replies, A/B tests,
// pausing and cancelling - identical on both backends.
import { request } from "@rapidrest/service-core/test";
import { simpleParser } from "mailparser";
import { CrmTestContext, call, setUpWorkspace } from "./context.js";

const PUBLIC = "https://crm.rapidmx-test.example.com";

export function campaignSuite(ctx: CrmTestContext): void {
    describe("campaigns", () => {
        let workspaceUid: string;
        let senderUid: string;
        let templateUid: string;
        let listUid: string;
        const path = (suffix: string = "") => `/campaigns/${workspaceUid}${suffix}`;
        /** An anonymous request to a path of the public API (`/api/mail/crm/...` of a link in an email). */
        const anon = (method: "get" | "post", link: string, headers: Record<string, string> = {}) => {
            let chain: any = (request(ctx.app()) as any)[method](`${ctx.prefix}${link.replace(`${PUBLIC}/api/mail/crm`, "")}`);
            for (const [name, value] of Object.entries(headers)) {
                chain = chain.set(name, value);
            }
            return chain;
        };
        const contact = async (email: string) => (await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email, firstName: "Ann" })).body;
        const subscribe = async (list: string, contactUids: string[]) =>
            await call(ctx, "post", `/subscriptions/${workspaceUid}`, ctx.users.editor, { listUid: list, contactUids, status: "subscribed" });
        const draft = async (extra: Record<string, unknown> = {}) =>
            (await call(ctx, "post", path(), ctx.users.editor, { name: "Launch", templateUid, senderUid, listUids: [listUid], ...extra })).body;
        const run = async (name: "campaign" | "send" | "events") => await (await ctx.job(name)).run();
        const sends = async (campaignUid: string) => {
            const all = await (await ctx.repo("outboundSend")).find({ sourceUid: campaignUid }, { ignoreACL: true, limit: 500 });
            return all.sort((a: any, b: any) => a.email.localeCompare(b.email));
        };
        const campaignRow = async (uid: string) => await (await ctx.repo("campaign")).findOne(uid, { ignoreACL: true, skipCache: true });
        const age = async (uid: string, hours: number) => {
            const row = await campaignRow(uid);
            await (await ctx.repo("campaign")).update({ uid, version: row.version, startedAt: new Date(Date.now() - hours * 3_600_000) }, row, { ignoreACL: true });
        };
        /** Moves the sending of every message of a campaign a minute back, so opens and clicks aren't taken for a server's. */
        const backdate = async (campaignUid: string) => {
            const repo = await ctx.repo("outboundSend");
            for (const send of await repo.find({ sourceUid: campaignUid }, { ignoreACL: true, limit: 500 })) {
                if (send.sentAt) {
                    await repo.update({ uid: send.uid, version: send.version, sentAt: new Date(Date.now() - 60_000) }, send, { ignoreACL: true });
                }
            }
        };
        /** Sends a scheduled campaign through: prepare, dispatch, finish. */
        const sendThrough = async (campaignUid: string) => {
            expect((await call(ctx, "post", path(`/${campaignUid}/schedule`), ctx.users.editor, {})).status).toBe(200);
            await run("campaign");
            await run("send");
            await run("campaign");
        };
        const parsed = async (index: number) => await simpleParser(ctx.transport().sent[index].raw);

        beforeEach(async () => {
            workspaceUid = await setUpWorkspace(ctx);
            await call(ctx, "put", `/workspaces/${workspaceUid}`, ctx.users.owner, { postalAddress: "1 Main St, Springfield" });
            await ctx.createMailbox(ctx.users.owner.uid, "news@acme.example");
            senderUid = (await call(ctx, "post", `/workspaces/${workspaceUid}/senders`, ctx.users.owner, { fromAddress: "news@acme.example", fromName: "Acme News" })).body.uid;
            templateUid = (
                await call(ctx, "post", `/templates/${workspaceUid}`, ctx.users.editor, {
                    name: "Launch",
                    subject: "Hi {{ contact.first_name }}",
                    design: {
                        sections: [
                            {
                                columns: [
                                    {
                                        blocks: [
                                            { type: "text", html: '<p>Read <a href="https://acme.example/news?a=1&amp;b=2">the news</a> or <a href="mailto:hi@acme.example">write</a>.</p>' },
                                            { type: "button", text: "Shop", href: "https://acme.example/shop" },
                                            { type: "footer" },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                })
            ).body.uid;
            listUid = (await call(ctx, "post", `/lists/${workspaceUid}`, ctx.users.owner, { name: "Newsletter", publicName: "Acme News" })).body.uid;
            ctx.transport().sent = [];
        });

        it("drafts, changes, duplicates and deletes campaigns, checking what they point at", async () => {
            const created = await call(ctx, "post", path(), ctx.users.editor, { name: "Launch" });
            expect(created.body).toMatchObject({ name: "Launch", status: "draft", listUids: [], trackOpens: true, trackClicks: true, recipientCount: 0, createdByUserUid: ctx.users.editor.uid });
            const uid: string = created.body.uid;
            const other = await setUpWorkspace(ctx, "Other");
            const otherList = (await call(ctx, "post", `/lists/${other}`, ctx.users.owner, { name: "Theirs" })).body.uid;
            for (const body of [
                { name: "" },
                { templateUid: "nope" },
                { senderUid: "nope" },
                { listUids: "x" },
                { listUids: [otherList] },
                { excludeListUids: Array.from({ length: 21 }, (_v, i) => `l${i}`) },
                { trackOpens: "yes" },
                { abTest: "x" },
                { abTest: { variants: [{}], metric: "open" } },
                { abTest: { variants: [{}, 5], metric: "open" } },
                { abTest: { variants: [{}, {}], metric: "views" } },
                { abTest: { variants: [{}, {}], metric: "open", testPercent: 90 } },
                { abTest: { variants: [{ subject: "{{ x" }, {}], metric: "open" } },
                { abTest: { variants: [{}, { templateUid: "nope" }], metric: "open" } },
            ]) {
                const result = await call(ctx, "put", path(`/${uid}`), ctx.users.editor, body);
                expect({ body, status: result.status }).toEqual({ body, status: 400 });
            }
            const updated = await call(ctx, "put", path(`/${uid}`), ctx.users.editor, {
                templateUid,
                senderUid,
                listUids: [listUid, listUid],
                excludeListUids: [],
                trackOpens: false,
                abTest: { variants: [{ subject: "Hi A" }, { templateUid }], metric: "click", testPercent: 30, testHours: 2 },
            });
            expect(updated.body).toMatchObject({ listUids: [listUid], trackOpens: false, abTest: { variants: [{ id: "A", subject: "Hi A" }, { id: "B", templateUid }], metric: "click", testPercent: 30, testHours: 2 } });
            const defaults = await call(ctx, "put", path(`/${uid}`), ctx.users.editor, { abTest: { variants: [{}, {}], metric: "reply" }, templateUid: null, senderUid: null });
            expect(defaults.body.abTest).toMatchObject({ testPercent: 20, testHours: 4 });
            expect(defaults.body.templateUid ?? null).toBeNull();

            const copy = await call(ctx, "post", path(`/${uid}/duplicate`), ctx.users.editor);
            expect(copy.body).toMatchObject({ name: "Copy of Launch", status: "draft", abTest: { metric: "reply" } });
            await call(ctx, "put", path(`/${uid}`), ctx.users.editor, { abTest: null });
            expect((await call(ctx, "post", path(`/${uid}/duplicate`), ctx.users.editor)).body.abTest ?? null).toBeNull();
            expect((await call(ctx, "post", path(`/${uid}/duplicate`), ctx.users.viewer)).status).toBe(403);
            expect((await call(ctx, "delete", path(`/${copy.body.uid}`), ctx.users.editor)).status).toBe(204);
        });

        it("lists what stands in the way of sending, and won't schedule until nothing does", async () => {
            await call(ctx, "put", `/workspaces/${workspaceUid}`, ctx.users.owner, { postalAddress: null });
            const noFooter = (
                await call(ctx, "post", `/templates/${workspaceUid}`, ctx.users.editor, { name: "Bare", subject: "x", design: { sections: [{ columns: [{ blocks: [{ type: "text", html: "<p>x</p>" }] }] }] } })
            ).body.uid;
            const uid: string = (await call(ctx, "post", path(), ctx.users.editor, { name: "Empty", listUids: [] })).body.uid;
            const problems = (await call(ctx, "get", path(`/${uid}/checklist`), ctx.users.viewer)).body;
            expect(problems.map((problem: any) => problem.field)).toEqual(["workspace", "senderUid", "listUids", "templateUid"]);
            expect((await call(ctx, "post", path(`/${uid}/schedule`), ctx.users.editor, {})).body.message).toMatch(/postal address/);

            await call(ctx, "put", path(`/${uid}`), ctx.users.editor, { abTest: { variants: [{}, { templateUid: noFooter }], metric: "open" }, templateUid });
            await (await ctx.repo("template")).update(
                { uid: templateUid, version: (await (await ctx.repo("template")).findOne(templateUid, { ignoreACL: true })).version, subject: "{{ broken" },
                await (await ctx.repo("template")).findOne(templateUid, { ignoreACL: true }),
                { ignoreACL: true },
            );
            const variants = (await call(ctx, "get", path(`/${uid}/checklist`), ctx.users.viewer)).body.map((problem: any) => problem.message);
            expect(variants).toEqual(expect.arrayContaining([expect.stringMatching(/broken merge tag.*\(variant A\)/), expect.stringMatching(/"Bare" \(variant B\)/)]));

            await call(ctx, "put", `/workspaces/${workspaceUid}`, ctx.users.owner, { postalAddress: "1 Main St" });
            const ready = (await draft()).uid;
            expect((await call(ctx, "get", path(`/${ready}/checklist`), ctx.users.viewer)).body).toEqual([expect.objectContaining({ field: "templateUid" })]);
        });

        it("schedules for later, goes back to a draft, and only allows each step from the right state", async () => {
            const uid: string = (await draft()).uid;
            expect((await call(ctx, "post", path(`/${uid}/unschedule`), ctx.users.editor)).status).toBe(400);
            expect((await call(ctx, "post", path(`/${uid}/pause`), ctx.users.editor)).status).toBe(400);
            expect((await call(ctx, "post", path(`/${uid}/resume`), ctx.users.editor)).status).toBe(400);
            expect((await call(ctx, "post", path(`/${uid}/cancel`), ctx.users.editor)).status).toBe(400);
            expect((await call(ctx, "post", path(`/${uid}/schedule`), ctx.users.editor, { sendAt: "soon" })).status).toBe(400);
            const later: string = new Date(Date.now() + 86_400_000).toISOString();
            const scheduled = await call(ctx, "post", path(`/${uid}/schedule`), ctx.users.editor, { sendAt: later });
            expect(scheduled.body).toMatchObject({ status: "scheduled", scheduledAt: later });
            expect((await call(ctx, "post", path(`/${uid}/schedule`), ctx.users.editor)).status).toBe(400);
            expect((await call(ctx, "put", path(`/${uid}`), ctx.users.editor, { name: "x" })).body.message).toBe("Only a draft campaign can be changed.");
            await run("campaign");
            expect((await campaignRow(uid)).status).toBe("scheduled");
            expect((await call(ctx, "post", path(`/${uid}/unschedule`), ctx.users.editor)).body.status).toBe("draft");
            await call(ctx, "post", path(`/${uid}/schedule`), ctx.users.editor, { sendAt: later });
            expect((await call(ctx, "post", path(`/${uid}/cancel`), ctx.users.editor)).body.status).toBe("cancelled");
            expect((await call(ctx, "delete", path(`/${uid}`), ctx.users.editor)).status).toBe(204);
        });

        it("sends to each subscriber once, skipping the excluded, the suppressed and those who opted out", async () => {
            const vip: string = (await call(ctx, "post", `/lists/${workspaceUid}`, ctx.users.owner, { name: "VIP" })).body.uid;
            const [ann, bob, cat, dan, eve] = await Promise.all(["ann@x.example", "bob@x.example", "cat@x.example", "dan@x.example", "eve@x.example"].map(contact));
            await subscribe(listUid, [ann.uid, bob.uid, cat.uid, dan.uid, eve.uid]);
            await subscribe(vip, [ann.uid, bob.uid]);
            expect((await call(ctx, "post", `/suppressions/${workspaceUid}`, ctx.users.owner, { email: "cat@x.example" })).status).toBe(200);
            const danRow = await (await ctx.repo("contact")).findOne(dan.uid, { ignoreACL: true });
            await (await ctx.repo("contact")).update({ uid: dan.uid, version: danRow.version, emailStatus: "unsubscribed" }, danRow, { ignoreACL: true });
            expect((await call(ctx, "post", path("/audience"), ctx.users.viewer, { listUids: [listUid, vip] })).body).toEqual({ count: 3, capped: false });
            expect((await call(ctx, "post", path("/audience"), ctx.users.viewer, { listUids: [listUid], excludeListUids: [vip] })).body.count).toBe(1);
            expect((await call(ctx, "post", path("/audience"), ctx.users.viewer, { listUids: "x" })).status).toBe(400);

            const campaign = await draft({ listUids: [listUid, vip], excludeListUids: [] });
            await call(ctx, "post", path(`/${campaign.uid}/schedule`), ctx.users.editor, {});
            await run("campaign");
            const prepared = await campaignRow(campaign.uid);
            expect(prepared).toMatchObject({ status: "sending", audienceDone: true, recipientCount: 3 });
            expect((await sends(campaign.uid)).map((send: any) => [send.email, send.status, send.variantId])).toEqual([
                ["ann@x.example", "queued", "A"],
                ["bob@x.example", "queued", "A"],
                ["eve@x.example", "queued", "A"],
            ]);
            expect((await call(ctx, "delete", path(`/${campaign.uid}`), ctx.users.editor)).body.message).toBe("Cancel the campaign before deleting it.");
            // Eve unsubscribes after her message was queued: it isn't sent.
            await call(ctx, "post", `/subscriptions/${workspaceUid}`, ctx.users.editor, { listUid, contactUids: [eve.uid], status: "unsubscribed" });

            await run("send");
            expect(ctx.transport().sent.map((message) => message.envelopeTo[0]).sort()).toEqual(["ann@x.example", "bob@x.example"]);
            const annIndex: number = ctx.transport().sent.findIndex((message) => message.envelopeTo[0] === "ann@x.example");
            const [annSend, bobSend, eveSend] = await sends(campaign.uid);
            expect(eveSend.status).toBe("suppressed");
            expect(annSend).toMatchObject({ status: "sent", attempts: 1, messageId: `${annSend.token}@acme.example` });
            const first = ctx.transport().sent[annIndex];
            expect(first.envelopeFrom).toBe(`news+b-${annSend.token}@acme.example`);
            const mail = await parsed(annIndex);
            expect(mail.subject).toBe("Hi Ann");
            expect(mail.messageId).toBe(`<${annSend.token}@acme.example>`);
            expect(mail.headers.get("precedence")).toBe("bulk");
            expect(first.raw.toString("utf-8")).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
            expect((mail.headers.get("list") as any).unsubscribe.url).toMatch(new RegExp(`^${PUBLIC}/api/mail/crm/public/unsubscribe/`));
            expect(mail.headers.get("feedback-id")).toBe(`${campaign.uid}:${workspaceUid}:crm:rapidmx`);
            expect(String(mail.html)).toContain(`${PUBLIC}/api/mail/crm/t/o/${annSend.token}`);
            expect(String(mail.html)).toContain("mailto:hi@acme.example");
            expect(String(mail.html)).not.toContain('href="https://acme.example/shop"');
            expect(String(mail.html)).toContain(`${PUBLIC}/subscriptions/unsubscribe/`);
            expect(mail.text).toContain("1 Main St, Springfield");

            await run("campaign");
            const finished = await campaignRow(campaign.uid);
            expect(finished).toMatchObject({ status: "sent", stats: { recipients: 3, sent: 2, suppressed: 1 } });
            const timeline = (await call(ctx, "get", `/timeline/${workspaceUid}/contact/${ann.uid}`, ctx.users.viewer)).body;
            expect(timeline.map((entry: any) => entry.summary)).toContain('Sent "Launch"');
        });

        it("tracks opens and clicks, and redirects only where the email's links went", async () => {
            const ann = await contact("ann@x.example");
            await subscribe(listUid, [ann.uid]);
            const campaign = await draft();
            await sendThrough(campaign.uid);
            await backdate(campaign.uid);
            const [send] = await sends(campaign.uid);
            const html: string = String((await parsed(0)).html);
            const links: string[] = [...html.matchAll(/href="([^"]*\/t\/c\/[^"]*)"/g)].map((match) => match[1].replace(/&amp;/g, "&"));
            expect(links).toHaveLength(2);

            const bot = await anon("get", `${PUBLIC}/api/mail/crm/t/o/${send.token}`, { "user-agent": "Barracuda scanner" });
            expect(bot.status).toBe(200);
            expect(bot.headers["content-type"]).toBe("image/gif");
            expect((await campaignRow(campaign.uid)).stats.opened).toBe(0);
            await anon("get", `${PUBLIC}/api/mail/crm/t/o/${send.token}`, { "user-agent": "Mozilla/5.0 (Macintosh)" });
            expect((await anon("get", `${PUBLIC}/api/mail/crm/t/o/unknown`)).status).toBe(200);

            const click = await anon("get", links[0], { "user-agent": "Mozilla/5.0" });
            expect(click.status).toBe(302);
            expect(click.headers.location).toBe("https://acme.example/news?a=1&b=2");
            await anon("get", links[1], { "user-agent": "Mozilla/5.0" });
            const tampered: string = links[0].replace(encodeURIComponent("https://acme.example/news?a=1&b=2"), encodeURIComponent("https://evil.example/"));
            expect((await anon("get", tampered)).status).toBe(404);
            expect((await anon("get", links[0].replace(/\/c\/[^/]+\//, "/c/short/"))).status).toBe(404);
            expect((await anon("get", links[0].replace(/\/0\?/, "/x?"))).status).toBe(404);
            expect((await anon("get", links[0].replace(/u=[^&]*/, "u=ftp%3A%2F%2Fx"))).status).toBe(404);

            const tracked = (await sends(campaign.uid))[0];
            expect(tracked).toMatchObject({ openCount: 2, clickCount: 2, machineOpen: false });
            const report = (await call(ctx, "get", path(`/${campaign.uid}/report`), ctx.users.viewer)).body;
            expect(report.stats).toMatchObject({ recipients: 1, sent: 1, opened: 1, clicked: 1 });
            expect(report.links).toEqual([
                { url: "https://acme.example/news?a=1&b=2", clicks: 1, uniqueClicks: 1 },
                { url: "https://acme.example/shop", clicks: 1, uniqueClicks: 1 },
            ]);
            const timeline = (await call(ctx, "get", `/timeline/${workspaceUid}/contact/${ann.uid}`, ctx.users.viewer)).body.map((entry: any) => entry.summary);
            expect(timeline).toEqual(expect.arrayContaining(['Opened "Launch"', 'Clicked a link in "Launch"']));
            expect((await (await ctx.repo("contact")).findOne(ann.uid, { ignoreACL: true, skipCache: true })).lastEngagedAt).toBeTruthy();

            const recipients = await call(ctx, "post", path(`/${campaign.uid}/recipients`), ctx.users.viewer, { engagement: "clicked", q: "ANN", status: "sent" });
            expect(recipients.body).toMatchObject({ total: 1, items: [{ email: "ann@x.example" }] });
            expect(recipients.body.items[0].token).toBeUndefined();
            expect((await call(ctx, "post", path(`/${campaign.uid}/recipients`), ctx.users.viewer, { engagement: "replied" })).body.total).toBe(0);
            expect((await call(ctx, "post", path(`/${campaign.uid}/recipients`), ctx.users.viewer)).body.total).toBe(1);
        });

        it("unsubscribes by the one-click header, counting it for the campaign", async () => {
            const ann = await contact("ann@x.example");
            await subscribe(listUid, [ann.uid]);
            const campaign = await draft();
            await sendThrough(campaign.uid);
            const header: string = ((await parsed(0)).headers.get("list") as any).unsubscribe.url;
            const page = await anon("get", header);
            expect(page.status).toBe(302);
            expect(page.headers.location).toMatch(new RegExp(`^${PUBLIC}/subscriptions/unsubscribe/`));
            const done = await anon("post", header);
            expect(done.body).toMatchObject({ workspaceName: "Acme Sales", list: "Acme News" });
            expect((await sends(campaign.uid))[0].unsubscribedAt).toBeTruthy();
            await anon("post", header);
            const report = (await call(ctx, "get", path(`/${campaign.uid}/report`), ctx.users.viewer)).body;
            expect(report.stats.unsubscribed).toBe(1);
            const subscriptions = (await call(ctx, "get", `/subscriptions/${workspaceUid}?contactUid=${ann.uid}`, ctx.users.viewer)).body;
            expect(subscriptions[0].status).toBe("unsubscribed");
        });

        it("learns of bounces, complaints and replies from the sender's mailbox", async () => {
            const [ann, bob, cat] = await Promise.all(["ann@x.example", "bob@x.example", "cat@x.example"].map(contact));
            await subscribe(listUid, [ann.uid, bob.uid, cat.uid]);
            const campaign = await draft();
            await sendThrough(campaign.uid);
            const [annSend, bobSend, catSend] = await sends(campaign.uid);
            const job = await ctx.job("events");
            const delivered = (extra: Record<string, unknown>) => ({
                type: "message.delivered",
                occurredAt: new Date().toISOString(),
                mailboxUid: "news@acme.example",
                messageUid: "m1",
                envelopeTo: ["news@acme.example"],
                references: [],
                ...extra,
            });

            // Somebody else's mailbox can't forge anything.
            await job.handle(delivered({ mailboxUid: "stranger@acme.example", inReplyTo: annSend.messageId }));
            await job.handle(delivered({ inReplyTo: "unknown@x" }));
            await job.handle(delivered({ references: [] }));
            // Automatic replies aren't replies.
            await job.handle(delivered({ inReplyTo: annSend.messageId, autoSubmitted: "auto-replied" }));
            await job.handle(delivered({ inReplyTo: annSend.messageId, precedence: "bulk" }));
            expect((await sends(campaign.uid))[0].repliedAt ?? null).toBeNull();
            await job.handle(delivered({ inReplyTo: "other@x", references: [annSend.messageId], autoSubmitted: "no" }));
            await job.handle(delivered({ inReplyTo: annSend.messageId }));

            // A soft bounce, then a hard one, by the bounce address; then a complaint by the returned Message-ID.
            const dsn = (outcome: string, status: string) =>
                delivered({ envelopeTo: [`news+b-${bobSend.token}@acme.example`], deliveryStatusReport: { recipients: [{ finalRecipient: "bob@x.example", status, outcome }] } });
            await job.handle(dsn("delayed", "4.4.1"));
            await job.handle(dsn("soft_bounce", "4.2.2"));
            expect((await sends(campaign.uid))[1]).toMatchObject({ bounceType: "soft" });
            await job.handle(dsn("hard_bounce", "5.1.1"));
            await job.handle(dsn("hard_bounce", "5.1.1"));
            await job.handle(delivered({ deliveryStatusReport: { originalMessageId: "nope@x", recipients: [{ finalRecipient: "x", outcome: "hard_bounce" }] } }));
            await job.handle(delivered({ feedbackReport: { feedbackType: "not-spam", originalMessageId: catSend.messageId } }));
            await job.handle(delivered({ feedbackReport: { feedbackType: "abuse", originalMessageId: catSend.messageId } }));
            await job.handle(delivered({ feedbackReport: { feedbackType: "abuse" } }));

            const [a, b, c] = await sends(campaign.uid);
            expect(a.repliedAt).toBeTruthy();
            expect(b).toMatchObject({ bounceType: "hard" });
            expect(c.complainedAt).toBeTruthy();
            const events = await (await ctx.repo("engagementEvent")).find({ sourceUid: campaign.uid }, { ignoreACL: true, limit: 100 });
            expect(events.filter((event: any) => event.type === "bounced")).toHaveLength(2);
            expect(events.filter((event: any) => event.type === "replied")).toHaveLength(1);
            const suppressed = (await call(ctx, "get", `/suppressions/${workspaceUid}`, ctx.users.viewer)).body.map((row: any) => [row.email, row.reason]).sort();
            expect(suppressed).toEqual([
                ["bob@x.example", "hard_bounce"],
                ["cat@x.example", "complaint"],
            ]);
            const statuses = await Promise.all([bob, cat].map(async (entry) => (await (await ctx.repo("contact")).findOne(entry.uid, { ignoreACL: true, skipCache: true })).emailStatus));
            expect(statuses).toEqual(["bounced", "complained"]);
            const timeline = (await call(ctx, "get", `/timeline/${workspaceUid}/contact/${bob.uid}`, ctx.users.viewer)).body.map((entry: any) => entry.summary);
            expect(timeline).toEqual(expect.arrayContaining(['"Launch" bounced (hard)']));
        });

        it("reads the mail event stream as a consumer group", async () => {
            const ann = await contact("ann@x.example");
            await subscribe(listUid, [ann.uid]);
            const campaign = await draft();
            await sendThrough(campaign.uid);
            const [send] = await sends(campaign.uid);
            const job = await ctx.job("events");
            await job.run();

            const entry = (id: string, event: unknown) => ({ id, message: { event: typeof event === "string" ? event : JSON.stringify(event) } });
            const reply = { type: "message.delivered", occurredAt: new Date().toISOString(), mailboxUid: "news@acme.example", messageUid: "m", envelopeTo: [], references: [], inReplyTo: send.messageId };
            const redis = {
                xGroupCreate: vi.fn().mockRejectedValueOnce(new Error("BUSYGROUP exists")),
                xAutoClaim: vi.fn().mockResolvedValue({ messages: [entry("1-0", "not json"), null] }),
                xReadGroup: vi
                    .fn()
                    .mockResolvedValueOnce([{ messages: [entry("2-0", { type: "message.sent" }), entry("3-0", reply)] }])
                    .mockResolvedValue(null),
                xAck: vi.fn().mockResolvedValue(1),
            };
            vi.spyOn(job, "redis").mockReturnValue(redis);
            job.batchSize = 2;
            await job.run();
            expect(redis.xAck.mock.calls.map((call: any[]) => call[2])).toEqual(["1-0", "2-0", "3-0"]);
            expect((await sends(campaign.uid))[0].repliedAt).toBeTruthy();

            // A handler failure leaves the entry for a retry; a read failure is logged.
            vi.spyOn(job, "handle").mockRejectedValueOnce(new Error("db down"));
            redis.xAutoClaim.mockResolvedValueOnce({ messages: [entry("4-0", reply)] });
            await job.run();
            expect(redis.xAck).toHaveBeenCalledTimes(3);
            redis.xAutoClaim.mockRejectedValueOnce(new Error("connection lost"));
            await job.run();
            const fresh = await ctx.job("events");
            vi.spyOn(fresh, "redis").mockReturnValue({ ...redis, xGroupCreate: vi.fn().mockRejectedValue(new Error("NOPERM")) });
            await fresh.run();
            expect(redis.xReadGroup).toHaveBeenCalledTimes(3);
        });

        it("retries temporary failures, fails permanent ones, and counts an address refused for good as a hard bounce", async () => {
            const [ann, bob, cat] = await Promise.all(["ann@x.example", "bob@x.example", "cat@x.example"].map(contact));
            await subscribe(listUid, [ann.uid, bob.uid, cat.uid]);
            const campaign = await draft();
            await call(ctx, "post", path(`/${campaign.uid}/schedule`), ctx.users.editor, {});
            await run("campaign");
            const transport = ctx.transport();
            vi.spyOn(transport, "send").mockImplementation(async (message: any) => {
                const to: string = message.envelopeTo[0];
                if (to === "ann@x.example") {
                    throw new Error("socket closed");
                }
                if (to === "bob@x.example") {
                    return { accepted: [], rejected: [to], failures: [{ address: to, code: 550, enhancedCode: "5.1.1", temporary: false, response: "No such user" }] };
                }
                return { accepted: [], rejected: [to], error: { message: "Policy", temporary: false } as any };
            });
            await run("send");
            const [a, b, c] = await sends(campaign.uid);
            expect(a).toMatchObject({ status: "queued", attempts: 1, error: "The mail transport failed: socket closed" });
            expect(new Date(a.nextAttemptAt).getTime()).toBeGreaterThan(Date.now() + 50_000);
            expect(b).toMatchObject({ status: "failed", bounceType: "hard", error: "No such user" });
            expect(c).toMatchObject({ status: "failed", error: "Policy" });
            expect((await (await ctx.repo("contact")).findOne(bob.uid, { ignoreACL: true, skipCache: true })).emailStatus).toBe("bounced");

            // Due again: a 4xx refusal without a failure entry is temporary too, until the attempts run out.
            const repo = await ctx.repo("outboundSend");
            const job = await ctx.job("send");
            job.maxAttempts = 2;
            await repo.update({ uid: a.uid, version: a.version, nextAttemptAt: new Date(0) }, a, { ignoreACL: true });
            vi.spyOn(transport, "send").mockResolvedValueOnce({ accepted: [], rejected: ["ann@x.example"], failures: [{ address: "other", code: 451 }] });
            await job.run();
            expect((await sends(campaign.uid))[0]).toMatchObject({ status: "failed", attempts: 2 });
            vi.restoreAllMocks();
        });

        it("waits while paused, drops what's left when cancelled, and stops at the rate cap", async () => {
            const people = await Promise.all(["ann@x.example", "bob@x.example", "cat@x.example"].map(contact));
            await subscribe(listUid, people.map((person) => person.uid));
            const campaign = await draft();
            await call(ctx, "post", path(`/${campaign.uid}/schedule`), ctx.users.editor, {});
            await run("campaign");
            expect((await call(ctx, "post", path(`/${campaign.uid}/pause`), ctx.users.editor)).body.status).toBe("paused");
            await run("send");
            expect(ctx.transport().sent).toHaveLength(0);
            expect((await call(ctx, "post", path(`/${campaign.uid}/resume`), ctx.users.editor)).body.status).toBe("sending");

            const job = await ctx.job("send");
            vi.spyOn(job.rateLimiter, "checkAndIncrement").mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Too many requests"));
            await job.run();
            expect(ctx.transport().sent).toHaveLength(1);
            vi.restoreAllMocks();

            expect((await call(ctx, "post", path(`/${campaign.uid}/cancel`), ctx.users.editor)).body.status).toBe("cancelled");
            const recount = await ctx.job("campaign");
            recount.statsSeconds = 0;
            await recount.run();
            expect((await sends(campaign.uid)).map((send: any) => send.status).sort()).toEqual(["cancelled", "cancelled", "sent"]);
            expect((await campaignRow(campaign.uid)).stats).toMatchObject({ recipients: 1, sent: 1 });

            // Messages of a campaign that's gone, or cancelled, are dropped by the dispatcher too.
            const other = await draft();
            await call(ctx, "post", path(`/${other.uid}/schedule`), ctx.users.editor, {});
            await run("campaign");
            const row = await campaignRow(other.uid);
            await (await ctx.repo("campaign")).update({ uid: other.uid, version: row.version, status: "cancelled" }, row, { ignoreACL: true });
            await run("send");
            expect((await sends(other.uid)).every((send: any) => send.status === "cancelled")).toBe(true);
        });

        it("fails a message whose template is gone, and pauses a campaign mid-preparation", async () => {
            const ann = await contact("ann@x.example");
            await subscribe(listUid, [ann.uid]);
            const campaign = await draft();
            await call(ctx, "post", path(`/${campaign.uid}/schedule`), ctx.users.editor, {});
            await run("campaign");
            await (await ctx.repo("template")).delete(templateUid, { ignoreACL: true, purge: true });
            await run("send");
            expect((await sends(campaign.uid))[0]).toMatchObject({ status: "failed", error: expect.stringMatching(/template or sender no longer exists/) });

            // Paused while preparing: resumes preparing.
            const second = await draft({ templateUid: undefined });
            const row = await campaignRow(second.uid);
            await (await ctx.repo("campaign")).update({ uid: second.uid, version: row.version, status: "preparing" }, row, { ignoreACL: true });
            expect((await call(ctx, "post", path(`/${second.uid}/pause`), ctx.users.editor)).body.status).toBe("paused");
            expect((await call(ctx, "post", path(`/${second.uid}/resume`), ctx.users.editor)).body.status).toBe("preparing");
            await run("campaign");
            expect((await campaignRow(second.uid)).status).toBe("sending");
        });

        it("finishes at once when nobody can be sent to, and prepares big audiences over several pages", async () => {
            const nobody = await draft();
            await call(ctx, "post", path(`/${nobody.uid}/schedule`), ctx.users.editor, {});
            await run("campaign");
            expect(await campaignRow(nobody.uid)).toMatchObject({ status: "sent", recipientCount: 0, error: "Nobody on the campaign's lists could be sent to." });

            const people = await Promise.all(Array.from({ length: 5 }, (_v, i) => contact(`p${i}@x.example`)));
            await subscribe(listUid, people.map((person) => person.uid));
            const campaign = await draft();
            await call(ctx, "post", path(`/${campaign.uid}/schedule`), ctx.users.editor, {});
            const job = await ctx.job("campaign");
            job.pagesPerRun = 1;
            // Two subscriptions a page: three runs to read five.
            job.audiencePageSize = 2;
            await job.run();
            expect(await campaignRow(campaign.uid)).toMatchObject({ status: "preparing", recipientCount: 2 });
            await job.run();
            await job.run();
            expect(await campaignRow(campaign.uid)).toMatchObject({ status: "sending", recipientCount: 5, audienceDone: true });
            // A replica that died after creating a page's messages but before saving its place: the page is read again, and
            // nobody gets a second message.
            const row = await campaignRow(campaign.uid);
            await (await ctx.repo("campaign")).update({ uid: campaign.uid, version: row.version, status: "preparing", audienceCursor: null, audienceDone: false, recipientCount: 0 }, row, { ignoreACL: true });
            job.audiencePageSize = 500;
            await job.run();
            expect(await campaignRow(campaign.uid)).toMatchObject({ status: "sending", recipientCount: 5 });
            expect(await sends(campaign.uid)).toHaveLength(5);
        });

        it("tests variants on part of the audience, then sends the winner to the rest", async () => {
            const people = await Promise.all(Array.from({ length: 16 }, (_v, i) => contact(`p${String(i).padStart(2, "0")}@x.example`)));
            await subscribe(listUid, people.map((person) => person.uid));
            const campaign = await draft({ abTest: { variants: [{ subject: "Subject A" }, { subject: "Subject B" }], metric: "open", testPercent: 50, testHours: 1 } });
            await call(ctx, "post", path(`/${campaign.uid}/schedule`), ctx.users.editor, {});
            await run("campaign");
            const prepared = await sends(campaign.uid);
            const held = prepared.filter((send: any) => send.status === "held");
            const tested = prepared.filter((send: any) => send.status === "queued");
            expect(held.length + tested.length).toBe(16);
            expect(held.every((send: any) => send.variantId === "")).toBe(true);
            await run("send");
            const subjects: Set<string> = new Set();
            for (let index = 0; index < ctx.transport().sent.length; index++) {
                subjects.add(String((await parsed(index)).subject));
            }
            await backdate(campaign.uid);
            // The deciding variant: B, by one open of one of its messages.
            const bSend = (await sends(campaign.uid)).find((send: any) => send.variantId === "B" && send.status === "sent");
            if (bSend) {
                await anon("get", `${PUBLIC}/api/mail/crm/t/o/${bSend.token}`, { "user-agent": "Mozilla/5.0" });
            }
            await run("campaign");
            expect((await campaignRow(campaign.uid)).abTest.winnerId).toBeUndefined();
            await age(campaign.uid, 2);
            await run("campaign");
            await run("campaign");
            const decided = await campaignRow(campaign.uid);
            expect(decided.abTest.winnerId).toBe(bSend ? "B" : "A");
            const released = (await sends(campaign.uid)).filter((send: any) => held.some((entry: any) => entry.uid === send.uid));
            expect(released.every((send: any) => send.status === "queued" && send.variantId === decided.abTest.winnerId)).toBe(true);
            await run("send");
            await run("campaign");
            const finished = await campaignRow(campaign.uid);
            expect(finished.status).toBe("sent");
            expect(Object.keys(finished.stats.variants)).toEqual(["A", "B"]);
            expect(finished.stats.recipients).toBe(16);
            expect(subjects.size).toBeGreaterThan(0);
        });

        it("recounts stats of recent campaigns, and forgets a deleted contact's messages", async () => {
            const ann = await contact("ann@x.example");
            await subscribe(listUid, [ann.uid]);
            const campaign = await draft();
            await sendThrough(campaign.uid);
            await backdate(campaign.uid);
            const [send] = await sends(campaign.uid);
            await anon("get", `${PUBLIC}/api/mail/crm/t/o/${send.token}`, { "user-agent": "Mozilla/5.0" });
            const job = await ctx.job("campaign");
            job.statsSeconds = 0;
            await job.run();
            expect((await campaignRow(campaign.uid)).stats.opened).toBe(1);

            expect((await call(ctx, "delete", `/contacts/${workspaceUid}/${ann.uid}`, ctx.users.editor)).status).toBe(204);
            expect(await sends(campaign.uid)).toEqual([]);
            expect(await (await ctx.repo("engagementEvent")).find({ contactUid: ann.uid }, { ignoreACL: true, limit: 10 })).toEqual([]);

            expect((await call(ctx, "delete", path(`/${campaign.uid}`), ctx.users.editor)).status).toBe(204);
            expect((await call(ctx, "delete", `/workspaces/${workspaceUid}`, ctx.users.owner)).status).toBe(204);
            for (const name of ["campaign", "template", "mailingList", "subscription"]) {
                expect(await (await ctx.repo(name)).find({ workspaceUid }, { ignoreACL: true, limit: 10 })).toEqual([]);
            }
        });

        it("does nothing without a mail transport, and leaves a message another replica claimed", async () => {
            const ann = await contact("ann@x.example");
            await subscribe(listUid, [ann.uid]);
            const campaign = await draft();
            await call(ctx, "post", path(`/${campaign.uid}/schedule`), ctx.users.editor, {});
            await run("campaign");
            const job = await ctx.job("send");
            const transport = job.mailTransport;
            job.mailTransport = undefined;
            await job.run();
            job.mailTransport = transport;
            const repo = await ctx.repo("outboundSend");
            const original = repo.update.bind(repo);
            vi.spyOn(repo, "update").mockRejectedValueOnce(new Error("version mismatch"));
            await job.run();
            expect(ctx.transport().sent).toHaveLength(0);
            vi.spyOn(repo, "update").mockRejectedValueOnce(new Error("disk full"));
            await job.run();
            expect(ctx.transport().sent).toHaveLength(0);
            repo.update = original;
            await job.run();
            expect(ctx.transport().sent).toHaveLength(1);
        });

        it("renders without tracking or a bounce address, filling in company properties", async () => {
            await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, { objectType: "company", key: "tier", label: "Tier", type: "text" });
            await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, { objectType: "contact", key: "plan", label: "Plan", type: "text" });
            const company = (await call(ctx, "post", `/companies/${workspaceUid}`, ctx.users.editor, { name: "Acme", properties: { tier: "gold" } })).body;
            const ann = (await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email: "ann@x.example", companyUid: company.uid, properties: { plan: "pro" } })).body;
            await subscribe(listUid, [ann.uid]);
            const template = (
                await call(ctx, "post", `/templates/${workspaceUid}`, ctx.users.editor, {
                    name: "Props",
                    subject: "For {{ company.name }}",
                    design: {
                        sections: [
                            {
                                columns: [
                                    {
                                        blocks: [
                                            { type: "text", html: '<p>{{ company.properties.tier }} {{ contact.properties.plan }} <a href="https://acme.example">go</a></p>' },
                                            { type: "footer" },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                })
            ).body;
            const campaign = await draft({ templateUid: template.uid, trackOpens: false, trackClicks: false });
            await call(ctx, "post", path(`/${campaign.uid}/schedule`), ctx.users.editor, {});
            await run("campaign");
            const job = await ctx.job("send");
            job.verp = false;
            await job.run();
            const mail = await parsed(0);
            expect(ctx.transport().sent[0].envelopeFrom).toBe("news@acme.example");
            expect(mail.subject).toBe("For Acme");
            expect(mail.text).toContain("gold pro");
            expect(String(mail.html)).toContain('href="https://acme.example"');
            expect(String(mail.html)).not.toContain("/t/o/");
        });

        it("copes with lost races, failed writes and vanished records in the jobs", async () => {
            const [ann, bob] = await Promise.all(["ann@x.example", "bob@x.example"].map(contact));
            await subscribe(listUid, [ann.uid, bob.uid]);
            const campaignJob = await ctx.job("campaign");
            const sendJob = await ctx.job("send");
            const eventJob = await ctx.job("events");
            expect([campaignJob.schedule, sendJob.schedule, eventJob.schedule]).toEqual(["*/5 * * * * *", "*/2 * * * * *", "*/2 * * * * *"]);
            campaignJob.start();
            campaignJob.stop();
            expect(campaignJob.publicLink("/x")).toBe(`${PUBLIC}/x`);
            campaignJob.configuredTokenSecret = "configured";
            expect(await campaignJob.tokenSecret()).toBe("configured");
            campaignJob.configuredTokenSecret = "";
            eventJob.connectionManager = { connections: new Map([["events", {}]]) };
            await eventJob.run();
            await sendJob.run();

            const campaign = await draft();
            await call(ctx, "post", path(`/${campaign.uid}/schedule`), ctx.users.editor, {});
            const campaigns = await ctx.repo("campaign");
            const sendsRepo = await ctx.repo("outboundSend");
            // A step that fails is logged, and the others still run; a lost race is no error.
            vi.spyOn(campaigns, "update").mockRejectedValueOnce(new Error("version mismatch"));
            await campaignJob.run();
            vi.spyOn(campaigns, "update").mockRejectedValueOnce(new Error("disk full"));
            await campaignJob.run();
            expect((await campaignRow(campaign.uid)).status).toBe("scheduled");
            vi.restoreAllMocks();
            vi.spyOn(sendsRepo, "create").mockRejectedValueOnce(new Error("duplicate key"));
            await campaignJob.run();
            vi.restoreAllMocks();
            expect(await campaignRow(campaign.uid)).toMatchObject({ status: "sending", recipientCount: 1 });

            // Ann's contact vanishes behind the API's back, Bob gets suppressed: neither is sent.
            await (await ctx.repo("contact")).delete(ann.uid, { ignoreACL: true, purge: true });
            await call(ctx, "post", `/suppressions/${workspaceUid}`, ctx.users.owner, { email: "bob@x.example" });
            await run("campaign");
            await sendJob.run();
            expect(ctx.transport().sent).toHaveLength(0);
            expect((await sends(campaign.uid)).map((send: any) => send.status)).toEqual(["suppressed"]);

            // A render failure other than a missing template is retried.
            const second = await draft();
            const cat = await contact("cat@x.example");
            await subscribe(listUid, [cat.uid]);
            await call(ctx, "post", path(`/${second.uid}/schedule`), ctx.users.editor, {});
            await run("campaign");
            const { CampaignRenderer } = await import("../../src/sending/CampaignRenderer.js");
            vi.spyOn(CampaignRenderer.prototype, "render").mockRejectedValueOnce(new Error("mjml crashed"));
            await sendJob.run();
            expect((await sends(second.uid)).find((send: any) => send.email === "cat@x.example")).toMatchObject({
                status: "queued",
                error: "Could not render the message: mjml crashed",
            });
            vi.restoreAllMocks();

            // Leased messages are left alone when a campaign is cancelled; a failed update is logged.
            const catSend = (await sends(second.uid)).find((send: any) => send.email === "cat@x.example");
            await sendsRepo.update({ uid: catSend.uid, version: catSend.version, leaseExpiresAt: new Date(Date.now() + 60_000) }, catSend, { ignoreACL: true });
            await call(ctx, "post", path(`/${second.uid}/cancel`), ctx.users.editor);
            await run("campaign");
            const leased = (await sends(second.uid)).find((send: any) => send.email === "cat@x.example");
            expect(leased.status).toBe("queued");
            await sendsRepo.update({ uid: leased.uid, version: leased.version, leaseExpiresAt: null }, leased, { ignoreACL: true });
            vi.spyOn(sendsRepo, "update").mockRejectedValue(new Error("disk full"));
            await run("campaign");
            vi.restoreAllMocks();
            expect((await sends(second.uid)).find((send: any) => send.email === "cat@x.example").status).toBe("queued");
            await run("campaign");
            expect((await sends(second.uid)).find((send: any) => send.email === "cat@x.example").status).toBe("cancelled");

            // A message of an automation (none exist yet) has no campaign: it is dropped, and never counts as replied to.
            const orphan = await sendsRepo.create(
                new (ctx.route("CampaignRoute").classes.outboundSend)({
                    workspaceUid,
                    sourceType: "automation",
                    sourceUid: "enrollment",
                    dedupeKey: "automation:enrollment:node",
                    contactUid: bob.uid,
                    email: "bob@x.example",
                    variantId: "A",
                    token: "abcdefghijklmnopqrstuv",
                    messageId: "orphan@x",
                }),
                { ignoreACL: true },
            );
            await sendJob.run();
            expect((await sendsRepo.findOne(orphan.uid, { ignoreACL: true, skipCache: true })).status).toBe("cancelled");
            const delivered = { type: "message.delivered", occurredAt: new Date().toISOString(), mailboxUid: "news@acme.example", messageUid: "m", envelopeTo: [] };
            await eventJob.handle({ ...delivered, references: undefined });
            await eventJob.handle({ ...delivered, references: [], inReplyTo: "orphan@x" });
            expect((await sendsRepo.findOne(orphan.uid, { ignoreACL: true, skipCache: true })).repliedAt ?? null).toBeNull();
        });

        it("retries engagement writes that lose a race, and names what isn't a campaign 'an email'", async () => {
            const ann = await contact("ann@x.example");
            await subscribe(listUid, [ann.uid]);
            const campaign = await draft({ abTest: { variants: [{}, {}], metric: "click", testPercent: 50, testHours: 1 } });
            await sendThrough(campaign.uid);
            const report = (await call(ctx, "get", path(`/${campaign.uid}/report`), ctx.users.viewer)).body;
            expect(Object.keys(report.stats.variants)).toEqual(["A", "B"]);
            // Whether Ann was in the test or held back, release her message and send it.
            await age(campaign.uid, 2);
            await run("campaign");
            await run("campaign");
            await run("send");
            await backdate(campaign.uid);
            const [send] = await sends(campaign.uid);
            const sendsRepo = await ctx.repo("outboundSend");
            const { EngagementRecorder } = await import("../../src/sending/Engagement.js");
            const route = ctx.route("CampaignRoute");
            const recorder = new EngagementRecorder(route.repos(), route.classes, undefined);

            const update = sendsRepo.update.bind(sendsRepo);
            let conflicts: number = 1;
            vi.spyOn(sendsRepo, "update").mockImplementation(async (...args: any[]) => {
                if (conflicts-- > 0) {
                    throw new Error("version mismatch");
                }
                return await update(...args);
            });
            const clicked = await recorder.record(send, "clicked", { url: "https://acme.example", machine: true });
            expect(clicked).toMatchObject({ clickCount: 1 });
            expect(clicked.firstOpenedAt).toBeTruthy();
            conflicts = 10;
            await expect(recorder.record(clicked, "clicked", { url: "https://acme.example" })).rejects.toThrow("version mismatch");
            vi.restoreAllMocks();
            // A tracking endpoint logs a failed write and still answers.
            vi.spyOn(EngagementRecorder.prototype, "record").mockRejectedValueOnce(new Error("db down"));
            expect((await anon("get", `${PUBLIC}/api/mail/crm/t/o/${send.token}`)).status).toBe(200);
            vi.restoreAllMocks();
            const capped = await sendsRepo.findOne(send.uid, { ignoreACL: true, skipCache: true });
            await sendsRepo.update({ uid: send.uid, version: capped.version, clickCount: 500, openCount: 100 }, capped, { ignoreACL: true });
            await anon("get", `${PUBLIC}/api/mail/crm/t/o/${send.token}`);
            expect((await sendsRepo.findOne(send.uid, { ignoreACL: true, skipCache: true })).openCount).toBe(100);

            // Complaints count once; a complaint doesn't undo a bounce; an existing suppression stays; a vanished contact is fine.
            const fresh = await sendsRepo.findOne(send.uid, { ignoreACL: true, skipCache: true });
            const contacts = await ctx.repo("contact");
            const row = await contacts.findOne(ann.uid, { ignoreACL: true, skipCache: true });
            await contacts.update({ uid: ann.uid, version: row.version, emailStatus: "bounced" }, row, { ignoreACL: true });
            await call(ctx, "post", `/suppressions/${workspaceUid}`, ctx.users.owner, { email: "ann@x.example" });
            const complained = await recorder.record(fresh, "complained");
            expect(await recorder.record(complained, "complained")).toBeUndefined();
            expect((await contacts.findOne(ann.uid, { ignoreACL: true, skipCache: true })).emailStatus).toBe("bounced");
            vi.spyOn(contacts, "findOne").mockRejectedValueOnce(new Error("db down"));
            const reopened = await recorder.record(complained, "opened");
            vi.restoreAllMocks();
            // Its campaign deleted behind the API's back, the message is just "an email".
            await (await ctx.repo("campaign")).delete(campaign.uid, { ignoreACL: true, purge: true });
            const automated = await recorder.record(reopened, "replied");
            expect(automated).toBeTruthy();
            const timeline = await (await ctx.repo("timelineEvent")).find({ subjectUid: ann.uid }, { ignoreACL: true, limit: 50 });
            expect(timeline.map((entry: any) => entry.summary)).toContain("Replied to an email");
            await contacts.delete(ann.uid, { ignoreACL: true, purge: true });
            expect(await recorder.record(automated, "clicked", { url: "https://acme.example" })).toBeTruthy();
        });

        it("doesn't send to a contact who opted out of all email after the message was queued", async () => {
            const ann = await contact("ann@x.example");
            await subscribe(listUid, [ann.uid]);
            const campaign = await draft();
            await call(ctx, "post", path(`/${campaign.uid}/schedule`), ctx.users.editor, {});
            await run("campaign");
            const contacts = await ctx.repo("contact");
            const row = await contacts.findOne(ann.uid, { ignoreACL: true, skipCache: true });
            await contacts.update({ uid: ann.uid, version: row.version, emailStatus: "unsubscribed" }, row, { ignoreACL: true });
            await run("send");
            expect(ctx.transport().sent).toHaveLength(0);
            expect((await sends(campaign.uid))[0].status).toBe("suppressed");
        });
    });
}
