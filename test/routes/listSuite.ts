///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Mailing lists, subscriptions, suppressions, forms, double opt-in, the preference center and unsubscribe links - identical on both
// backends.
import { request } from "@rapidrest/service-core/test";
import { signToken } from "../../src/util/Tokens.js";
import { CrmTestContext, call, setUpWorkspace } from "./context.js";

export function listSuite(ctx: CrmTestContext): void {
    describe("lists, subscriptions and forms", () => {
        let workspaceUid: string;
        let senderUid: string;

        /** An anonymous request to the public API. */
        const anon = (method: "get" | "post", path: string, body?: unknown) => {
            let chain: any = (request(ctx.app()) as any)[method](`${ctx.prefix}/public${path}`);
            if (body !== undefined) {
                chain = chain.send(body);
            }
            return chain;
        };
        const createList = async (body: Record<string, unknown>) => {
            const created = await call(ctx, "post", `/lists/${workspaceUid}`, ctx.users.owner, body);
            expect(created.status).toBe(200);
            return created.body;
        };
        const createContact = async (email: string) => (await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email })).body;
        const subscriptionsOf = async (contactUid: string) =>
            (await call(ctx, "get", `/subscriptions/${workspaceUid}?contactUid=${contactUid}`, ctx.users.viewer)).body;
        const tokenFor = async (payload: Record<string, unknown>) => await ctx.route("PublicRoute").token({ w: workspaceUid, ...payload });
        /** The path of the link in the last email sent (`/subscriptions/confirm/<token>`). */
        const lastLink = (): string => {
            const raw: string = ctx.transport().sent.at(-1)!.raw.toString("utf-8").replace(/=\r?\n/g, "");
            const match = /https:\/\/crm\.rapidmx-test\.example\.com(\/subscriptions\/confirm\/[A-Za-z0-9_\-.]+)/.exec(raw);
            return match![1];
        };

        beforeEach(async () => {
            workspaceUid = await setUpWorkspace(ctx);
            await ctx.createMailbox(ctx.users.owner.uid, "news@acme.example");
            senderUid = (await call(ctx, "post", `/workspaces/${workspaceUid}/senders`, ctx.users.owner, { fromAddress: "news@acme.example", fromName: "Acme News" })).body.uid;
            ctx.transport().sent = [];
        });

        describe("lists", () => {
            it("creates, lists with counts, changes and deletes lists - admins only", async () => {
                const list = await createList({ name: "Newsletter", description: "Monthly news", publicDescription: "Our monthly news" });
                expect(list).toMatchObject({ name: "Newsletter", publicName: "Newsletter", doubleOptIn: false, visible: true, subscribedCount: 0, pendingCount: 0 });
                expect((await call(ctx, "post", `/lists/${workspaceUid}`, ctx.users.editor, { name: "x" })).status).toBe(403);
                for (const body of [{}, { name: "x", doubleOptIn: true }, { name: "x", senderUid: "nope" }, { name: "x", visible: "yes" }]) {
                    expect((await call(ctx, "post", `/lists/${workspaceUid}`, ctx.users.owner, body)).status).toBe(400);
                }

                const contact = await createContact("a@x.example");
                await call(ctx, "post", `/subscriptions/${workspaceUid}`, ctx.users.editor, { listUid: list.uid, contactUids: [contact.uid], status: "subscribed" });
                const listed = await call(ctx, "get", `/lists/${workspaceUid}`, ctx.users.viewer);
                expect(listed.body[0]).toMatchObject({ uid: list.uid, subscribedCount: 1 });

                const changed = await call(ctx, "put", `/lists/${workspaceUid}/${list.uid}`, ctx.users.owner, { publicName: "The Acme Letter", doubleOptIn: true, senderUid });
                expect(changed.body).toMatchObject({ publicName: "The Acme Letter", doubleOptIn: true, senderUid });
                expect((await call(ctx, "put", `/lists/${workspaceUid}/${list.uid}`, ctx.users.owner, { senderUid: null })).status).toBe(400);
                expect((await call(ctx, "put", `/lists/${workspaceUid}/${list.uid}`, ctx.users.owner, { name: null })).status).toBe(400);
                expect((await call(ctx, "put", `/lists/${workspaceUid}/${list.uid}`, ctx.users.owner, { publicName: null })).body.publicName).toBe("Newsletter");
                expect((await call(ctx, "put", `/lists/${workspaceUid}/${list.uid}`, ctx.users.owner, { doubleOptIn: false, senderUid: "" })).body.senderUid ?? undefined).toBeUndefined();

                expect((await call(ctx, "delete", `/lists/${workspaceUid}/${list.uid}`, ctx.users.owner)).status).toBe(204);
                expect(await subscriptionsOf(contact.uid)).toEqual([]);
                const search = await call(ctx, "post", `/contacts/${workspaceUid}/search`, ctx.users.viewer, { filter: { field: "lists", op: "eq", value: list.uid } });
                expect(search.body.total).toBe(0);
            });
        });

        describe("subscriptions", () => {
            it("subscribes and unsubscribes contacts in bulk, and filters contacts by list", async () => {
                const list = await createList({ name: "Newsletter" });
                const a = await createContact("a@x.example");
                const b = await createContact("b@x.example");
                const path = `/subscriptions/${workspaceUid}`;

                expect((await call(ctx, "post", path, ctx.users.editor, { listUid: list.uid, contactUids: [a.uid, b.uid, "nope"], status: "subscribed" })).body).toEqual({ changed: 2 });
                expect((await call(ctx, "post", path, ctx.users.editor, { listUid: list.uid, contactUids: [b.uid], status: "unsubscribed" })).body).toEqual({ changed: 1 });
                // Doing it again changes nothing.
                await call(ctx, "post", path, ctx.users.editor, { listUid: list.uid, contactUids: [b.uid], status: "unsubscribed" });

                const onList = await call(ctx, "post", `/contacts/${workspaceUid}/search`, ctx.users.viewer, { filter: { field: "lists", op: "eq", value: list.uid } });
                expect(onList.body.items.map((contact: any) => contact.email)).toEqual(["a@x.example"]);
                const offList = await call(ctx, "post", `/contacts/${workspaceUid}/search`, ctx.users.viewer, { filter: { field: "lists", op: "ne", value: list.uid } });
                expect(offList.body.items.map((contact: any) => contact.email)).toEqual(["b@x.example"]);
                expect((await call(ctx, "get", `${path}?listUid=${list.uid}&status=unsubscribed`, ctx.users.viewer)).body).toHaveLength(1);
                const [subscription] = await subscriptionsOf(b.uid);
                expect(subscription).toMatchObject({ status: "unsubscribed", source: "manual" });
                expect(subscription.unsubscribedAt).toBeTruthy();
                const timeline = await call(ctx, "get", `/timeline/${workspaceUid}/contact/${b.uid}`, ctx.users.viewer);
                expect(timeline.body.slice(0, 2).map((entry: any) => entry.summary)).toEqual(["Unsubscribed from Newsletter", "Subscribed to Newsletter"]);

                for (const body of [
                    { listUid: "nope", contactUids: [a.uid], status: "subscribed" },
                    { listUid: 5, contactUids: [a.uid], status: "subscribed" },
                    { listUid: list.uid, contactUids: [a.uid], status: "pending" },
                    { listUid: list.uid, contactUids: [], status: "subscribed" },
                    { listUid: list.uid, contactUids: "a", status: "subscribed" },
                ]) {
                    expect((await call(ctx, "post", path, ctx.users.editor, body)).status).toBe(400);
                }
                expect((await call(ctx, "post", path, ctx.users.viewer, { listUid: list.uid, contactUids: [a.uid], status: "subscribed" })).status).toBe(403);

                // Deleting a contact deletes its subscriptions.
                await call(ctx, "delete", `/contacts/${workspaceUid}/${a.uid}`, ctx.users.editor);
                expect(await subscriptionsOf(a.uid)).toEqual([]);
            });
        });

        describe("suppressions", () => {
            it("adds, looks up, annotates and removes suppressed addresses", async () => {
                const path = `/suppressions/${workspaceUid}`;
                const added = await call(ctx, "post", path, ctx.users.owner, { email: "Gone@X.example", note: "Asked by phone" });
                expect(added.body).toMatchObject({ email: "gone@x.example", reason: "manual", note: "Asked by phone" });
                expect((await call(ctx, "post", path, ctx.users.owner, { email: "gone@x.example" })).status).toBe(409);
                expect((await call(ctx, "post", path, ctx.users.owner, { email: "x@x.example", reason: "because" })).status).toBe(400);
                expect((await call(ctx, "post", path, ctx.users.editor, { email: "y@x.example" })).status).toBe(403);
                const bounced = await call(ctx, "post", path, ctx.users.owner, { email: "b@x.example", reason: "hard_bounce" });
                expect(bounced.body.reason).toBe("hard_bounce");

                expect((await call(ctx, "get", `${path}?email=GONE@x.example`, ctx.users.viewer)).body.map((entry: any) => entry.email)).toEqual(["gone@x.example"]);
                expect((await call(ctx, "put", `${path}/${added.body.uid}`, ctx.users.owner, { note: null })).body.note ?? undefined).toBeUndefined();
                expect((await call(ctx, "put", `${path}/${added.body.uid}`, ctx.users.owner, {})).status).toBe(200);
                expect((await call(ctx, "put", `${path}/${added.body.uid}`, ctx.users.owner, { reason: "complaint" })).status).toBe(400);
                expect((await call(ctx, "delete", `${path}/${added.body.uid}`, ctx.users.owner)).status).toBe(204);
                expect((await call(ctx, "get", path, ctx.users.viewer)).body).toHaveLength(1);
            });
        });

        describe("forms", () => {
            const formPath = () => `/forms/${workspaceUid}`;

            it("creates forms with fields, lists and double opt-in, and refuses bad ones", async () => {
                const list = await createList({ name: "Newsletter" });
                await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, { objectType: "contact", key: "plan", label: "Plan", type: "select", options: ["free", "pro"] });
                const created = await call(ctx, "post", formPath(), ctx.users.owner, { name: "Footer signup", listUids: [list.uid, list.uid], senderUid });
                expect(created.status).toBe(200);
                expect(created.body).toMatchObject({
                    title: "Footer signup",
                    fields: [{ target: "email", label: "Email", required: true }],
                    listUids: [list.uid],
                    doubleOptIn: true,
                    enabled: true,
                    successMessage: "Thanks for signing up!",
                });
                const changed = await call(ctx, "put", `${formPath()}/${created.body.uid}`, ctx.users.owner, {
                    fields: [
                        { target: "email", label: "Your email", required: false },
                        { target: "firstName", label: "First name", required: true },
                        { target: "properties.plan", label: "Plan" },
                    ],
                    redirectUrl: "https://acme.example/thanks",
                    tags: ["Signup"],
                    title: "Join us",
                    description: "News once a month",
                });
                expect(changed.body.fields).toEqual([
                    { target: "email", label: "Your email", required: true },
                    { target: "firstName", label: "First name", required: true },
                    { target: "properties.plan", label: "Plan", required: false },
                ]);
                expect(changed.body.tags).toEqual(["signup"]);

                for (const body of [
                    { name: "x", fields: [] },
                    { name: "x", fields: [{ target: "firstName", label: "Name" }] },
                    { name: "x", fields: [{ target: "salary", label: "Salary" }, { target: "email", label: "Email" }] },
                    { name: "x", fields: [{ target: "email", label: "Email" }, { target: "email", label: "Again" }] },
                    { name: "x", fields: [{ target: "email", label: "" }] },
                    { name: "x", listUids: ["nope"] },
                    { name: "x", listUids: "all" },
                    { name: "x", listUids: [list.uid] },
                    { name: "x", redirectUrl: "http://acme.example" },
                    { name: "x", senderUid: "nope" },
                    {},
                ]) {
                    expect((await call(ctx, "post", formPath(), ctx.users.owner, body)).status).toBe(400);
                }
                expect((await call(ctx, "put", `${formPath()}/${created.body.uid}`, ctx.users.owner, { title: null })).status).toBe(400);
                // A form with no lists doesn't need a sender, even with double opt-in.
                expect((await call(ctx, "post", formPath(), ctx.users.owner, { name: "Contact us", senderUid: null })).status).toBe(200);
                expect((await call(ctx, "post", formPath(), ctx.users.editor, { name: "x" })).status).toBe(403);
            });

            it("serves an enabled form to anyone, with its custom properties' types and options", async () => {
                await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, { objectType: "contact", key: "plan", label: "Plan", type: "select", options: ["free", "pro"] });
                await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, { objectType: "contact", key: "seats", label: "Seats", type: "number" });
                const form = (
                    await call(ctx, "post", formPath(), ctx.users.owner, {
                        name: "Signup",
                        description: "Hello",
                        fields: [
                            { target: "email", label: "Email" },
                            { target: "company", label: "Company" },
                            { target: "properties.plan", label: "Plan" },
                            { target: "properties.seats", label: "Seats" },
                        ],
                    })
                ).body;
                await call(ctx, "delete", `/properties/${workspaceUid}/${(await call(ctx, "get", `/properties/${workspaceUid}`, ctx.users.owner)).body.find((entry: any) => entry.key === "seats").uid}`, ctx.users.owner);

                const served = await anon("get", `/forms/${form.uid}`);
                expect(served.status).toBe(200);
                expect(served.body).toEqual({
                    uid: form.uid,
                    title: "Signup",
                    description: "Hello",
                    fields: [
                        { target: "email", label: "Email", required: true, type: "email" },
                        { target: "company", label: "Company", required: false, type: "text" },
                        { target: "properties.plan", label: "Plan", required: false, type: "select", options: [{ value: "free", label: "free" }, { value: "pro", label: "pro" }] },
                    ],
                });
                await call(ctx, "put", `${formPath()}/${form.uid}`, ctx.users.owner, { enabled: false });
                expect((await anon("get", `/forms/${form.uid}`)).status).toBe(404);
                expect((await anon("get", "/forms/nope")).status).toBe(404);
                expect((await anon("post", `/forms/${form.uid}`, { values: { email: "a@x.example" } })).status).toBe(404);
            });

            it("subscribes a form's submitter at once without double opt-in, creating the contact, its company and its properties", async () => {
                const list = await createList({ name: "Updates" });
                await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, { objectType: "contact", key: "seats", label: "Seats", type: "number" });
                await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, { objectType: "contact", key: "beta", label: "Beta", type: "boolean" });
                await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, { objectType: "contact", key: "tools", label: "Tools", type: "multi_select", options: ["mail", "crm"] });
                await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, { objectType: "contact", key: "plan", label: "Plan", type: "select", options: ["free", "pro"] });
                const form = (
                    await call(ctx, "post", formPath(), ctx.users.owner, {
                        name: "Trial",
                        doubleOptIn: false,
                        listUids: [list.uid],
                        tags: ["trial"],
                        redirectUrl: "https://acme.example/welcome",
                        fields: [
                            { target: "email", label: "Email" },
                            { target: "firstName", label: "First name", required: true },
                            { target: "company", label: "Company" },
                            { target: "properties.seats", label: "Seats" },
                            { target: "properties.beta", label: "Beta" },
                            { target: "properties.tools", label: "Tools" },
                            { target: "properties.plan", label: "Plan" },
                        ],
                    })
                ).body;

                expect((await anon("post", `/forms/${form.uid}`, { values: { email: "a@x.example" } })).status).toBe(400);
                expect((await anon("post", `/forms/${form.uid}`, { values: { email: "nope", firstName: "Ann" } })).status).toBe(400);
                expect((await anon("post", `/forms/${form.uid}`, { values: { email: "a@x.example", firstName: "Ann", "properties.seats": "many" } })).status).toBe(400);
                const submitted = await anon("post", `/forms/${form.uid}`, {
                    values: { email: "Ann@X.example", firstName: "Ann", company: "Acme", "properties.seats": "12", "properties.beta": "on", "properties.tools": "crm", "properties.plan": "pro" },
                });
                expect(submitted.status).toBe(200);
                expect(submitted.body).toEqual({ result: "subscribed", message: "Thanks for signing up!", redirectUrl: "https://acme.example/welcome" });
                expect(ctx.transport().sent).toEqual([]);

                const contact = (await call(ctx, "post", `/contacts/${workspaceUid}/search`, ctx.users.viewer, { q: "ann@" })).body.items[0];
                expect(contact).toMatchObject({ email: "ann@x.example", firstName: "Ann", source: "form", tags: ["trial"], properties: { seats: 12, beta: true, tools: ["crm"], plan: "pro" } });
                expect(contact.companyUid).toBeTruthy();
                const [subscription] = await subscriptionsOf(contact.uid);
                expect(subscription).toMatchObject({ status: "subscribed", source: "form" });
                expect(subscription.consentAt).toBeTruthy();
                const timeline = await call(ctx, "get", `/timeline/${workspaceUid}/contact/${contact.uid}`, ctx.users.viewer);
                expect(timeline.body.map((entry: any) => entry.kind)).toEqual(expect.arrayContaining(["form_submitted", "subscribed", "created"]));
                expect((await call(ctx, "get", `${formPath()}/${form.uid}`, ctx.users.viewer)).body.submissionCount).toBe(1);

                // Filling it in again only fills in what the contact doesn't have yet.
                await call(ctx, "put", `/contacts/${workspaceUid}/${contact.uid}`, ctx.users.editor, { companyUid: null });
                await anon("post", `/forms/${form.uid}`, { values: { email: "ann@x.example", firstName: "Annie", company: "Acme", "properties.seats": "3", "properties.beta": false } });
                const again = (await call(ctx, "get", `/contacts/${workspaceUid}/${contact.uid}`, ctx.users.viewer)).body;
                expect(again).toMatchObject({ firstName: "Ann", companyUid: contact.companyUid, properties: { seats: 12, beta: true } });
                expect((await call(ctx, "post", `/companies/${workspaceUid}/search`, ctx.users.viewer, {})).body.total).toBe(1);
            });

            it("ignores a submission that filled in the trap field", async () => {
                const form = (await call(ctx, "post", formPath(), ctx.users.owner, { name: "Signup" })).body;
                const answer = await anon("post", `/forms/${form.uid}`, { values: { email: "bot@x.example" }, website: "http://spam.example" });
                expect(answer.body.result).toBe("subscribed");
                expect((await call(ctx, "post", `/contacts/${workspaceUid}/search`, ctx.users.viewer, {})).body.total).toBe(0);
                // A form with no lists just collects the contact.
                expect((await anon("post", `/forms/${form.uid}`, "not an object")).status).toBe(400);
                expect((await anon("post", `/forms/${form.uid}`, { values: { email: "c@x.example" } })).body.result).toBe("subscribed");
            });
        });

        describe("double opt-in", () => {
            it("keeps a form's subscription pending, emails a confirmation link, and subscribes once it is used", async () => {
                const newsletter = await createList({ name: "Newsletter", publicName: "The Acme Letter", doubleOptIn: true, senderUid });
                const offers = await createList({ name: "Offers" });
                const form = (await call(ctx, "post", `/forms/${workspaceUid}`, ctx.users.owner, { name: "Signup", listUids: [newsletter.uid, offers.uid], senderUid })).body;

                const submitted = await anon("post", `/forms/${form.uid}`, { values: { email: "ann@x.example" } });
                expect(submitted.body).toEqual({ result: "confirm", message: "Check your inbox to confirm your subscription." });
                const contact = (await call(ctx, "post", `/contacts/${workspaceUid}/search`, ctx.users.viewer, {})).body.items[0];
                expect((await subscriptionsOf(contact.uid)).map((entry: any) => entry.status)).toEqual(["pending", "pending"]);
                expect((await call(ctx, "get", `/lists/${workspaceUid}/${newsletter.uid}`, ctx.users.viewer)).body.pendingCount).toBe(1);

                const [mail] = ctx.transport().sent;
                expect(mail.envelopeFrom).toBe("news@acme.example");
                expect(mail.envelopeTo).toEqual(["ann@x.example"]);
                const raw: string = mail.raw.toString("utf-8");
                expect(raw).toContain("Subject: Please confirm your subscription");
                expect(raw).toContain("multipart/alternative");
                const confirmPath: string = lastLink();
                expect((await subscriptionsOf(contact.uid))[0].confirmSentAt).toBeTruthy();

                const confirmed = await anon("post", `/confirm/${confirmPath.split("/").pop()}`);
                expect(confirmed.body).toEqual({ workspaceName: "Acme Sales", lists: ["The Acme Letter", "Offers"] });
                expect((await subscriptionsOf(contact.uid)).map((entry: any) => [entry.status, entry.source])).toEqual([
                    ["subscribed", "double-opt-in"],
                    ["subscribed", "double-opt-in"],
                ]);
                // Confirming again changes nothing; submitting again doesn't ask again.
                expect((await anon("post", `/confirm/${confirmPath.split("/").pop()}`)).body.lists).toHaveLength(2);
                expect((await anon("post", `/forms/${form.uid}`, { values: { email: "ann@x.example" } })).body.result).toBe("subscribed");
                expect(ctx.transport().sent).toHaveLength(1);
            });

            it("refuses bad, expired and misused confirmation tokens, and skips lists deleted or left since", async () => {
                const list = await createList({ name: "Newsletter" });
                const contact = await createContact("a@x.example");
                expect((await anon("post", "/confirm/garbage")).status).toBe(404);
                expect((await anon("post", `/confirm/${await tokenFor({ p: "prefs", c: contact.uid })}`)).status).toBe(404);
                expect((await anon("post", `/confirm/${await tokenFor({ p: "confirm", c: contact.uid, l: [list.uid], x: 1 })}`)).status).toBe(404);
                expect((await anon("post", `/confirm/${signToken({ p: "confirm", w: workspaceUid, c: contact.uid }, "wrong key")}`)).status).toBe(404);
                expect((await anon("post", `/confirm/${await tokenFor({ p: "confirm", c: "nobody" })}`)).status).toBe(404);

                await call(ctx, "post", `/subscriptions/${workspaceUid}`, ctx.users.editor, { listUid: list.uid, contactUids: [contact.uid], status: "unsubscribed" });
                const token = await tokenFor({ p: "confirm", c: contact.uid, l: [list.uid, "deleted-list"] });
                expect((await anon("post", `/confirm/${token}`)).body.lists).toEqual([]);
                expect((await subscriptionsOf(contact.uid))[0].status).toBe("unsubscribed");
            });

            it("still takes a submission whose confirmation email can't be sent", async () => {
                const list = await createList({ name: "Newsletter" });
                const form = (await call(ctx, "post", `/forms/${workspaceUid}`, ctx.users.owner, { name: "Signup", listUids: [list.uid], senderUid })).body;
                await call(ctx, "delete", `/workspaces/${workspaceUid}/senders/${senderUid}`, ctx.users.owner);
                expect((await anon("post", `/forms/${form.uid}`, { values: { email: "a@x.example" } })).body.result).toBe("confirm");

                vi.spyOn(ctx.transport(), "send").mockResolvedValue({ accepted: [], rejected: ["b@x.example"] });
                await ctx.createMailbox(ctx.users.owner.uid, "news2@acme.example");
                const sender2 = (await call(ctx, "post", `/workspaces/${workspaceUid}/senders`, ctx.users.owner, { fromAddress: "news2@acme.example" })).body.uid;
                await call(ctx, "put", `/forms/${workspaceUid}/${form.uid}`, ctx.users.owner, { senderUid: sender2 });
                expect((await anon("post", `/forms/${form.uid}`, { values: { email: "b@x.example" } })).body.result).toBe("confirm");
                vi.restoreAllMocks();
            });
        });

        describe("preference center and unsubscribe links", () => {
            it("shows the lists a subscriber can choose, and changes them", async () => {
                const news = await createList({ name: "Newsletter", publicName: "News", publicDescription: "Monthly" });
                const hidden = await createList({ name: "VIP", visible: false });
                const secret = await createList({ name: "Internal", visible: false });
                const contact = await createContact("a@x.example");
                await call(ctx, "post", `/subscriptions/${workspaceUid}`, ctx.users.editor, { listUid: hidden.uid, contactUids: [contact.uid], status: "subscribed" });
                const token: string = await tokenFor({ p: "prefs", c: contact.uid });

                const view = await anon("get", `/preferences/${token}`);
                expect(view.body).toEqual({
                    workspaceName: "Acme Sales",
                    email: "a@x.example",
                    unsubscribedAll: false,
                    lists: [
                        { uid: news.uid, name: "News", description: "Monthly", subscribed: false },
                        { uid: hidden.uid, name: "VIP", subscribed: true },
                    ],
                });
                const changed = await anon("post", `/preferences/${token}`, { lists: { [news.uid]: true, [hidden.uid]: false } });
                expect(changed.body.lists.map((list: any) => [list.name, list.subscribed])).toEqual([["News", true]]);
                expect((await subscriptionsOf(contact.uid)).find((entry: any) => entry.listUid === news.uid)).toMatchObject({ status: "subscribed", source: "preferences" });
                expect((await anon("post", `/preferences/${token}`, { lists: { [secret.uid]: true } })).status).toBe(400);
                expect((await anon("post", `/preferences/${token}`, { lists: { [news.uid]: "yes" } })).status).toBe(400);
                expect((await anon("get", "/preferences/garbage")).status).toBe(404);
                expect((await anon("post", `/preferences/${token}`, "nothing")).status).toBe(200);
            });

            it("unsubscribes from everything and back again", async () => {
                const news = await createList({ name: "Newsletter" });
                const contact = await createContact("a@x.example");
                await call(ctx, "post", `/subscriptions/${workspaceUid}`, ctx.users.editor, { listUid: news.uid, contactUids: [contact.uid], status: "subscribed" });
                const token: string = await tokenFor({ p: "prefs", c: contact.uid });

                const out = await anon("post", `/preferences/${token}`, { unsubscribeAll: true });
                expect(out.body).toMatchObject({ unsubscribedAll: true, lists: [{ subscribed: false }] });
                expect((await call(ctx, "get", `/contacts/${workspaceUid}/${contact.uid}`, ctx.users.viewer)).body.emailStatus).toBe("unsubscribed");

                const back = await anon("post", `/preferences/${token}`, { unsubscribeAll: false });
                expect(back.body.unsubscribedAll).toBe(false);
                expect((await anon("post", `/preferences/${token}`, { lists: { [news.uid]: true } })).body.lists[0].subscribed).toBe(true);
            });

            it("unsubscribes in one click from one list or from all email, keeping a bounced address bounced", async () => {
                const news = await createList({ name: "Newsletter", publicName: "News" });
                const contact = await createContact("a@x.example");
                await call(ctx, "post", `/subscriptions/${workspaceUid}`, ctx.users.editor, { listUid: news.uid, contactUids: [contact.uid], status: "subscribed" });

                const one = await request(ctx.app())
                    .post(`${ctx.prefix}/public/unsubscribe/${await tokenFor({ p: "unsub", c: contact.uid, l: [news.uid] })}`)
                    .set("Content-Type", "application/x-www-form-urlencoded")
                    .send("List-Unsubscribe=One-Click");
                expect(one.status).toBe(200);
                expect(one.body).toMatchObject({ workspaceName: "Acme Sales", list: "News" });
                expect((await anon("get", `/preferences/${one.body.preferencesToken}`)).body.email).toBe("a@x.example");
                expect((await subscriptionsOf(contact.uid))[0]).toMatchObject({ status: "unsubscribed", source: "unsubscribe-link" });

                const all = await anon("post", `/unsubscribe/${await tokenFor({ p: "unsub", c: contact.uid, l: ["deleted-list"] })}`);
                expect(all.body.list).toBeUndefined();
                expect((await call(ctx, "get", `/contacts/${workspaceUid}/${contact.uid}`, ctx.users.viewer)).body.emailStatus).toBe("unsubscribed");

                const bounced = (await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email: "b@x.example", emailStatus: "bounced" })).body;
                await anon("post", `/unsubscribe/${await tokenFor({ p: "unsub", c: bounced.uid })}`);
                const token = await tokenFor({ p: "prefs", c: bounced.uid });
                await anon("post", `/preferences/${token}`, { unsubscribeAll: false });
                expect((await call(ctx, "get", `/contacts/${workspaceUid}/${bounced.uid}`, ctx.users.viewer)).body.emailStatus).toBe("bounced");
                expect((await anon("post", "/unsubscribe/garbage")).status).toBe(404);
            });

            it("signs with one generated key shared by every route, and reuses it", async () => {
                // The routes keep the key once read; the test data is cleared between tests, so start them afresh.
                const route = ctx.route("PublicRoute");
                route.cachedTokenSecret = undefined;
                const first: string = await route.tokenSecret();
                expect(await route.tokenSecret()).toBe(first);
                expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
                const other = ctx.route("ListRoute");
                other.cachedTokenSecret = undefined;
                expect(await other.tokenSecret()).toBe(first);
                const settings = await ctx.repo("setting");
                expect(await settings.count({}, { ignoreACL: true })).toBe(1);

                // A configured key wins over the generated one.
                const previous: string = route.configuredTokenSecret;
                route.configuredTokenSecret = "configured";
                expect(await route.tokenSecret()).toBe("configured");
                route.configuredTokenSecret = previous;
            });

            it("uses the key another server saved first when two generate one at once", async () => {
                const settings = await ctx.repo("setting");
                await settings.create(new settings.modelClass({ key: "token-secret", value: "saved-first" }), { ignoreACL: true });
                const route = ctx.route("PublicRoute");
                route.cachedTokenSecret = undefined;
                const { CrmRepoUtils } = await import("../../src/models/CrmModelClasses.js");
                const original = CrmRepoUtils.prototype.find;
                let hidden = false;
                vi.spyOn(CrmRepoUtils.prototype, "find").mockImplementation(async function (this: any, ...args: any[]) {
                    if (this.modelClass.name.startsWith("CrmSetting") && !hidden) {
                        hidden = true;
                        return [];
                    }
                    return await original.apply(this, args as any);
                });
                expect(await route.tokenSecret()).toBe("saved-first");
                vi.restoreAllMocks();
                route.cachedTokenSecret = undefined;
            });
        });

        describe("imports into a list", () => {
            it("subscribes every imported contact to the chosen list", async () => {
                const list = await createList({ name: "Imported" });
                const uploaded = await request(ctx.app())
                    .post(`${ctx.prefix}/imports/${workspaceUid}?objectType=contact`)
                    .set("Authorization", `jwt ${ctx.users.editor.token}`)
                    .set("Content-Type", "text/csv")
                    .send(Buffer.from("email\na@x.example\nb@x.example\n"));
                const start = (body: Record<string, unknown>) => call(ctx, "post", `/imports/${workspaceUid}/${uploaded.body.import.uid}/start`, ctx.users.editor, body);
                expect((await start({ mapping: [{ column: "email", target: "email" }], listUid: "nope" })).status).toBe(400);
                expect((await start({ mapping: [{ column: "email", target: "email" }], listUid: list.uid })).body.listUid).toBe(list.uid);
                const job = await ctx.importJob();
                await job.run();
                expect((await call(ctx, "get", `/lists/${workspaceUid}/${list.uid}`, ctx.users.viewer)).body.subscribedCount).toBe(2);

                const companies = await request(ctx.app())
                    .post(`${ctx.prefix}/imports/${workspaceUid}?objectType=company`)
                    .set("Authorization", `jwt ${ctx.users.editor.token}`)
                    .set("Content-Type", "text/csv")
                    .send(Buffer.from("name\nAcme\n"));
                const refused = await call(ctx, "post", `/imports/${workspaceUid}/${companies.body.import.uid}/start`, ctx.users.editor, {
                    mapping: [{ column: "name", target: "name" }],
                    listUid: list.uid,
                });
                expect(refused.status).toBe(400);
            });
        });
    });
}
