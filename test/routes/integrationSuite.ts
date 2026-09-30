///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Webhooks and their deliveries, API keys and the integration API, reports, and the deployment administration - identical on both
// backends.
import { request } from "@rapidrest/service-core/test";
import { MAX_ENDPOINT_FAILURES } from "../../src/jobs/WebhookDeliveryJob.js";
import { STOPPED_RETRY_MS } from "../../src/jobs/SendDispatchJob.js";
import { MAX_REPORT_ROWS, lastDays } from "../../src/routes/BaseAnalyticsRoute.js";
import { CrmTestContext, call, setUpWorkspace } from "./context.js";

export function integrationSuite(ctx: CrmTestContext): void {
    describe("webhooks, API keys, reports and administration", () => {
        let workspaceUid: string;
        const hooksPath = (suffix: string = "") => `/webhooks/${workspaceUid}${suffix}`;
        const keysPath = (suffix: string = "") => `/api-keys/${workspaceUid}${suffix}`;
        const contact = async (email: string, extra: Record<string, unknown> = {}) => (await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email, ...extra })).body;
        const row = async (model: string, uid: string) => await (await ctx.repo(model)).findOne(uid, { ignoreACL: true, skipCache: true });
        const change = async (model: string, uid: string, fields: Record<string, unknown>) => {
            const current = await row(model, uid);
            return await (await ctx.repo(model)).update({ uid, version: current.version, ...fields }, current, { ignoreACL: true });
        };
        const deliveriesOf = async (endpointUid: string) =>
            (await (await ctx.repo("webhookDelivery")).find({ endpointUid }, { ignoreACL: true, limit: 100, skipCache: true })).sort((a: any, b: any) =>
                a.eventType.localeCompare(b.eventType),
            );
        const hook = async (body: Record<string, unknown> = {}) => (await call(ctx, "post", hooksPath(), ctx.users.owner, { url: "https://hooks.example.com/in", ...body })).body;
        /** A `WebhookDeliveryJob` whose posts answer what `answer` says. */
        const deliveryJob = async (answer: (url: string, body: string, secret: string) => Promise<{ status: number }>) => {
            const job = await ctx.job("webhooks");
            job.post = vi.fn(answer);
            return job;
        };
        /** A request with an integration API key. */
        const api = (method: "get" | "post", path: string, key: string | undefined, body?: unknown) => {
            let chain: any = (request(ctx.app()) as any)[method](`${ctx.prefix}/integrations/${workspaceUid}${path}`);
            if (key !== undefined) {
                chain = chain.set("Authorization", key);
            }
            return body === undefined ? chain : chain.send(body);
        };

        beforeEach(async () => {
            workspaceUid = await setUpWorkspace(ctx);
        });

        it("manages webhook endpoints, showing the secret only when it is made", async () => {
            expect((await call(ctx, "post", hooksPath(), ctx.users.editor, { url: "https://hooks.example.com/in" })).status).toBe(403);
            for (const body of [
                {},
                { url: "http://hooks.example.com/in" },
                { url: "https://10.0.0.1/in" },
                { url: "https://hooks.example.com/in", events: [] },
                { url: "https://hooks.example.com/in", events: ["nope"] },
                { url: "https://hooks.example.com/in", events: "deal.won" },
                { url: "https://hooks.example.com/in", events: [5] },
            ]) {
                expect({ body, status: (await call(ctx, "post", hooksPath(), ctx.users.owner, body)).status }).toEqual({ body, status: 400 });
            }
            const created = await hook({ events: ["deal.won", "deal.won", "contact.created"], description: "Zapier" });
            expect(created).toMatchObject({ url: "https://hooks.example.com/in", events: ["deal.won", "contact.created"], enabled: true, failureCount: 0, description: "Zapier" });
            expect(created.secret).toMatch(/^whsec_/);
            expect(created.secretHint).toBe(`…${created.secret.slice(-4)}`);
            expect((await hook()).events).toEqual(["*"]);

            const listed = (await call(ctx, "get", hooksPath(), ctx.users.viewer)).body;
            expect(listed).toHaveLength(2);
            expect(listed.every((entry: any) => entry.secret === undefined && entry.secretHint)).toBe(true);

            const path = hooksPath(`/${created.uid}`);
            expect((await call(ctx, "put", path, ctx.users.owner, { url: null })).status).toBe(400);
            expect((await call(ctx, "put", path, ctx.users.owner, { url: "https://localhost/x" })).status).toBe(400);
            await change("webhookEndpoint", created.uid, { enabled: false, failureCount: 7 });
            const updated = await call(ctx, "put", path, ctx.users.owner, { url: "https://other.example.com/", events: ["*"], enabled: true, description: null });
            expect(updated.body).toMatchObject({ url: "https://other.example.com/", events: ["*"], enabled: true, failureCount: 0 });
            expect(updated.body.description ?? null).toBeNull();
            // Switching off, or leaving on, keeps the failure count.
            await change("webhookEndpoint", created.uid, { failureCount: 3 });
            expect((await call(ctx, "put", path, ctx.users.owner, { enabled: true })).body.failureCount).toBe(3);
            expect((await call(ctx, "put", path, ctx.users.owner, { enabled: false })).body.failureCount).toBe(3);
            expect((await call(ctx, "put", path, ctx.users.owner, { description: "Zapier" })).body).toMatchObject({ description: "Zapier", enabled: false });

            const rotated = await call(ctx, "post", `${path}/secret`, ctx.users.owner);
            expect(rotated.body.secret).toMatch(/^whsec_/);
            expect(rotated.body.secret).not.toBe(created.secret);
            expect((await row("webhookEndpoint", created.uid)).secret).toBe(rotated.body.secret);
            expect((await call(ctx, "post", `${path}/secret`, ctx.users.editor)).status).toBe(403);
        });

        it("pings an endpoint, lists its deliveries, and deletes them with it", async () => {
            const created = await hook();
            const route = ctx.route("WebhookRoute");
            const original = route.post;
            try {
                route.post = vi.fn(async () => ({ status: 200 }));
                expect((await call(ctx, "post", hooksPath(`/${created.uid}/test`), ctx.users.owner)).body).toEqual({ status: 200 });
                const [url, body, secret] = route.post.mock.calls[0];
                expect(url).toBe("https://hooks.example.com/in");
                expect(JSON.parse(body)).toMatchObject({ type: "ping", workspaceUid, data: {} });
                expect(secret).toBe(created.secret);
                route.post = vi.fn(async () => {
                    throw new Error("The address resolves to a private network.");
                });
                expect((await call(ctx, "post", hooksPath(`/${created.uid}/test`), ctx.users.owner)).body).toEqual({ error: "The address resolves to a private network." });
                route.post = vi.fn(async () => await Promise.reject("odd"));
                expect((await call(ctx, "post", hooksPath(`/${created.uid}/test`), ctx.users.owner)).body).toEqual({ error: "odd" });
            } finally {
                route.post = original;
            }
            expect((await call(ctx, "post", hooksPath(`/${created.uid}/test`), ctx.users.editor)).status).toBe(403);

            await contact("ann@x.example");
            await (await ctx.job("triggers")).run();
            const deliveries = (await call(ctx, "get", hooksPath(`/${created.uid}/deliveries`), ctx.users.viewer)).body;
            expect(deliveries).toHaveLength(1);
            expect(deliveries[0]).toMatchObject({ eventType: "contact.created", status: "pending", payload: { type: "contact.created", contact: { email: "ann@x.example" } } });
            expect((await call(ctx, "get", hooksPath("/nope/deliveries"), ctx.users.viewer)).status).toBe(404);

            expect((await call(ctx, "delete", hooksPath(`/${created.uid}`), ctx.users.owner)).status).toBe(204);
            expect(await deliveriesOf(created.uid)).toEqual([]);
        });

        it("queues each event for the enabled endpoints that take it", async () => {
            const all = await hook();
            const contacts = await hook({ events: ["contact.created"] });
            const deals = await hook({ events: ["deal.won"] });
            const off = await hook({ enabled: false });
            const other = await setUpWorkspace(ctx, "Other");
            const theirs = (await call(ctx, "post", `/webhooks/${other}`, ctx.users.owner, { url: "https://hooks.example.com/theirs" })).body;

            const ann = await contact("ann@x.example", { firstName: "Ann", lastName: "Lee" });
            await call(ctx, "post", `/contacts/${other}`, ctx.users.owner, { email: "bob@x.example" });
            await (await ctx.job("triggers")).run();
            expect((await deliveriesOf(all.uid)).map((delivery: any) => delivery.eventType)).toEqual(["contact.created"]);
            expect((await deliveriesOf(contacts.uid))[0].payload).toMatchObject({
                type: "contact.created",
                workspaceUid,
                contact: { uid: ann.uid, email: "ann@x.example", firstName: "Ann", lastName: "Lee" },
            });
            expect(await deliveriesOf(deals.uid)).toEqual([]);
            expect(await deliveriesOf(off.uid)).toEqual([]);
            expect((await deliveriesOf(theirs.uid))[0].payload.contact.email).toBe("bob@x.example");

            // An event whose contact is gone still goes out, without one.
            const events = await ctx.repo("crmEvent");
            await events.create(new (ctx.route("WebhookRoute").classes.crmEvent)({ workspaceUid, type: "manual", contactUid: "gone", occurredAt: new Date(), data: {} }), {
                ignoreACL: true,
            });
            await (await ctx.job("triggers")).run();
            const manual = (await deliveriesOf(all.uid)).find((delivery: any) => delivery.eventType === "manual");
            expect(manual.payload.contact).toBeUndefined();
        });

        it("delivers, retries with backoff, gives up, and switches off an endpoint that keeps failing", async () => {
            const endpoint = await hook();
            await contact("ann@x.example");
            await (await ctx.job("triggers")).run();
            const [delivery] = await deliveriesOf(endpoint.uid);

            // A 500, then a network error: retried later, the endpoint's failures counted.
            let job = await deliveryJob(async () => ({ status: 500 }));
            expect(job.schedule).toBe("*/5 * * * * *");
            await job.run();
            let saved = await row("webhookDelivery", delivery.uid);
            expect(saved).toMatchObject({ status: "pending", attempts: 1, responseStatus: 500, lastError: "The endpoint answered 500." });
            expect(new Date(saved.nextAttemptAt).getTime()).toBeGreaterThan(Date.now() + 50_000);
            expect((await row("webhookEndpoint", endpoint.uid)).failureCount).toBe(1);
            await job.run();
            expect(job.post).toHaveBeenCalledTimes(1);

            await change("webhookDelivery", delivery.uid, { nextAttemptAt: new Date(Date.now() - 1000) });
            job = await deliveryJob(async () => {
                throw new Error("ECONNRESET");
            });
            await job.run();
            expect((await row("webhookDelivery", delivery.uid)).lastError).toBe("ECONNRESET");
            await change("webhookDelivery", delivery.uid, { nextAttemptAt: new Date(Date.now() - 1000) });
            job = await deliveryJob(async () => await Promise.reject("odd"));
            await job.run();
            expect((await row("webhookDelivery", delivery.uid)).lastError).toBe("odd");

            // A 2xx delivers it, signed, and clears the endpoint's failures.
            await change("webhookDelivery", delivery.uid, { nextAttemptAt: new Date(Date.now() - 1000) });
            job = await deliveryJob(async () => ({ status: 202 }));
            await job.run();
            const [url, body, secret] = job.post.mock.calls[0];
            expect([url, JSON.parse(body).type, secret]).toEqual(["https://hooks.example.com/in", "contact.created", endpoint.secret]);
            saved = await row("webhookDelivery", delivery.uid);
            expect(saved).toMatchObject({ status: "delivered", responseStatus: 202 });
            expect(saved.deliveredAt).toBeTruthy();
            expect(await row("webhookEndpoint", endpoint.uid)).toMatchObject({ failureCount: 0 });
            expect((await row("webhookEndpoint", endpoint.uid)).lastDeliveryAt).toBeTruthy();

            // The last attempt fails it for good.
            await contact("bob@x.example");
            await (await ctx.job("triggers")).run();
            const second = (await deliveriesOf(endpoint.uid)).find((entry: any) => entry.status === "pending");
            await change("webhookDelivery", second.uid, { attempts: 7 });
            job = await deliveryJob(async () => ({ status: 404 }));
            await job.run();
            expect(await row("webhookDelivery", second.uid)).toMatchObject({ status: "failed", attempts: 8 });

            // Too big to send: counted as a failure without posting.
            await contact("cat@x.example");
            await (await ctx.job("triggers")).run();
            const third = (await deliveriesOf(endpoint.uid)).find((entry: any) => entry.status === "pending");
            await change("webhookDelivery", third.uid, { payload: { ...third.payload, data: { blob: "x".repeat(300 * 1024) } } });
            job = await deliveryJob(async () => ({ status: 200 }));
            await job.run();
            expect(job.post).not.toHaveBeenCalled();
            expect((await row("webhookDelivery", third.uid)).lastError).toBe("The payload is too big to send.");

            // Enough failures in a row switch the endpoint off; its queued deliveries then fail.
            await change("webhookEndpoint", endpoint.uid, { failureCount: MAX_ENDPOINT_FAILURES - 1 });
            await change("webhookDelivery", third.uid, { nextAttemptAt: new Date(Date.now() - 1000), payload: third.payload });
            await contact("dan@x.example");
            await (await ctx.job("triggers")).run();
            job = await deliveryJob(async () => ({ status: 503 }));
            await job.run();
            expect(await row("webhookEndpoint", endpoint.uid)).toMatchObject({ enabled: false, failureCount: MAX_ENDPOINT_FAILURES });
            expect(job.post).toHaveBeenCalledTimes(1);
            const left = (await deliveriesOf(endpoint.uid)).filter((entry: any) => entry.lastError === "The endpoint is switched off.");
            expect(left).toHaveLength(1);
            expect(left[0].status).toBe("failed");
        });

        it("fails the deliveries of a deleted endpoint, deletes old ones, and survives a failing store", async () => {
            const endpoint = await hook();
            await contact("ann@x.example");
            await (await ctx.job("triggers")).run();
            const [delivery] = await deliveriesOf(endpoint.uid);
            await (await ctx.repo("webhookEndpoint")).delete(endpoint.uid, { ignoreACL: true });
            let job = await deliveryJob(async () => ({ status: 200 }));
            await job.run();
            expect(await row("webhookDelivery", delivery.uid)).toMatchObject({ status: "failed", lastError: "The endpoint is switched off." });

            // Finished deliveries are deleted after the retention period.
            await job.run();
            expect(await row("webhookDelivery", delivery.uid)).toBeTruthy();
            job.retentionDays = -1;
            await job.run();
            expect(await row("webhookDelivery", delivery.uid)).toBeFalsy();

            // A store error is logged, unless it is a lost race for the claim.
            const live = await hook();
            await contact("bob@x.example");
            await (await ctx.job("triggers")).run();
            for (const [message, logged] of [
                ["disk full", 1],
                ["version mismatch", 0],
            ] as const) {
                job = await deliveryJob(async () => ({ status: 200 }));
                const error = vi.fn();
                job.logger = { error, info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
                const repoOf = job.repo.bind(job);
                job.repo = async (name: string) => {
                    const repo = await repoOf(name);
                    return name === "webhookEndpoint"
                        ? {
                              ...repo,
                              findOne: async () => {
                                  throw new Error(message);
                              },
                          }
                        : repo;
                };
                await job.run();
                expect(error).toHaveBeenCalledTimes(logged);
                expect(job.post).not.toHaveBeenCalled();
            }
            job = await deliveryJob(async () => ({ status: 200 }));
            job.logger = undefined;
            job.repo = async () => ({
                find: async () => [{ uid: "x", version: 0 }],
                update: async () => await Promise.reject("odd"),
                truncate: async () => undefined,
            });
            await job.run();
            expect((await deliveriesOf(live.uid))[0].status).toBe("pending");
        });

        it("posts webhooks from automations, and starts automations from named custom events", async () => {
            const endpoint = await hook({ events: ["automation.webhook"] });
            const path = (suffix: string = "") => `/automations/${workspaceUid}${suffix}`;
            const publish = async (graph: unknown) => {
                const created = (await call(ctx, "post", path(), ctx.users.editor, { name: "Flow", graph })).body;
                return await call(ctx, "post", path(`/${created.uid}/publish`), ctx.users.editor);
            };
            const graph = (endpointUid: string, trigger: Record<string, unknown> = { event: "manual" }) => ({
                nodes: [
                    { id: "t", type: "trigger", config: trigger },
                    { id: "w", type: "webhook", config: { endpointUid } },
                    { id: "x", type: "exit" },
                ],
                edges: [
                    { from: "t", to: "w" },
                    { from: "w", to: "x", port: "next" },
                ],
            });
            expect((await publish(graph("nope"))).body.message).toMatch(/a webhook/);
            const unnamed = graph("");
            unnamed.nodes[1].config = {};
            expect((await publish(unnamed)).status).toBe(400);
            const automation = (await publish(graph(endpoint.uid))).body;
            const ann = await contact("ann@x.example", { firstName: "Ann" });
            const bob = await contact("bob@x.example");
            await call(ctx, "post", path(`/${automation.uid}/enroll`), ctx.users.editor, { contactUids: [ann.uid, bob.uid] });
            await (await ctx.job("automations")).run();
            const payloads = (await deliveriesOf(endpoint.uid)).map((delivery: any) => delivery.payload).sort((a: any, b: any) => a.contact.email.localeCompare(b.contact.email));
            expect(payloads).toHaveLength(2);
            expect(payloads[0]).toMatchObject({ type: "automation.webhook", workspaceUid, contact: { uid: ann.uid, firstName: "Ann" }, data: { automationUid: automation.uid, automationName: "Flow", nodeId: "w" } });
            expect(payloads[1].contact.firstName ?? null).toBeNull();
            const enrollments = await (await ctx.repo("enrollment")).find({ automationUid: automation.uid }, { ignoreACL: true, limit: 10 });
            expect(enrollments.map((enrollment: any) => enrollment.state)).toEqual(["completed", "completed"]);

            // A switched-off endpoint is stepped past.
            await call(ctx, "put", hooksPath(`/${endpoint.uid}`), ctx.users.owner, { enabled: false });
            const cat = await contact("cat@x.example");
            await call(ctx, "post", path(`/${automation.uid}/enroll`), ctx.users.editor, { contactUids: [cat.uid] });
            await (await ctx.job("automations")).run();
            expect(await deliveriesOf(endpoint.uid)).toHaveLength(2);
            const catEnrollment = (await (await ctx.repo("enrollment")).find({ automationUid: automation.uid, contactUid: cat.uid }, { ignoreACL: true, limit: 1 }))[0];
            expect(catEnrollment.history.map((step: any) => step.outcome)).toContain("webhook off");

            // A custom trigger naming an event starts only from that event.
            await call(ctx, "put", hooksPath(`/${endpoint.uid}`), ctx.users.owner, { enabled: true });
            const named = (await publish(graph(endpoint.uid, { event: "custom", name: "trial.started" }))).body;
            const key = (await call(ctx, "post", keysPath(), ctx.users.owner, { name: "App" })).body.key;
            await api("post", "/events", `Bearer ${key}`, { email: "dan@x.example", name: "trial.ended" });
            await api("post", "/events", `Bearer ${key}`, { email: "eve@x.example", name: "trial.started", data: { plan: "pro" } });
            for (let round = 0; round < 2; round++) {
                await (await ctx.job("triggers")).run();
                await (await ctx.job("automations")).run();
            }
            const started = await (await ctx.repo("enrollment")).find({ automationUid: named.uid }, { ignoreACL: true, limit: 10 });
            expect(started).toHaveLength(1);
            expect((await row("contact", started[0].contactUid)).email).toBe("eve@x.example");
        });

        it("issues API keys once, keeps only their hash, and scopes them", async () => {
            expect((await call(ctx, "post", keysPath(), ctx.users.editor, { name: "App" })).status).toBe(403);
            for (const body of [{}, { name: "App", scopes: [] }, { name: "App", scopes: ["everything"] }, { name: "App", scopes: "contacts" }]) {
                expect({ body, status: (await call(ctx, "post", keysPath(), ctx.users.owner, body)).status }).toEqual({ body, status: 400 });
            }
            const created = (await call(ctx, "post", keysPath(), ctx.users.owner, { name: "App" })).body;
            expect(created.key).toMatch(/^crm_[A-Za-z0-9_-]{43}$/);
            expect(created).toMatchObject({ name: "App", prefix: created.key.slice(0, 12), scopes: ["contacts", "subscriptions", "events"], createdByUserUid: ctx.users.owner.uid });
            expect(created.hash).toBeUndefined();
            expect((await row("apiKey", created.uid)).hash).toMatch(/^[0-9a-f]{64}$/);
            const listed = (await call(ctx, "get", keysPath(), ctx.users.owner)).body;
            expect(listed[0].key).toBeUndefined();
            expect(listed[0].hash).toBeUndefined();

            const path = keysPath(`/${created.uid}`);
            expect((await call(ctx, "put", path, ctx.users.owner, { name: null })).status).toBe(400);
            expect((await call(ctx, "put", path, ctx.users.owner, { name: "Shop", scopes: ["events", "events"] })).body).toMatchObject({ name: "Shop", scopes: ["events"] });
            expect((await call(ctx, "put", path, ctx.users.owner, {})).body).toMatchObject({ name: "Shop", scopes: ["events"] });
            expect((await call(ctx, "delete", path, ctx.users.owner)).status).toBe(204);
            expect((await api("get", "/lists", `Bearer ${created.key}`)).status).toBe(401);
        });

        it("lets a key add contacts, change subscriptions and report events, as its scopes allow", async () => {
            const listUid = (await call(ctx, "post", `/lists/${workspaceUid}`, ctx.users.owner, { name: "News", publicName: "Acme News" })).body.uid;
            const otherList = (await call(ctx, "post", `/lists/${workspaceUid}`, ctx.users.owner, { name: "Deals" })).body.uid;
            const key = (await call(ctx, "post", keysPath(), ctx.users.owner, { name: "App" })).body;
            const bearer = `Bearer ${key.key}`;
            const narrow = (await call(ctx, "post", keysPath(), ctx.users.owner, { name: "Events only", scopes: ["events"] })).body;
            const other = await setUpWorkspace(ctx, "Other");
            const theirs = (await call(ctx, "post", `/api-keys/${other}`, ctx.users.owner, { name: "Theirs" })).body;

            for (const header of [undefined, "Bearer nope", "Basic abc", `Bearer ${theirs.key}`, `Bearer crm_${"a".repeat(43)}`]) {
                expect({ header, status: (await api("get", "/lists", header)).status }).toEqual({ header, status: 401 });
            }
            expect((await api("post", "/contacts", `Bearer ${narrow.key}`, { email: "a@x.example" })).status).toBe(403);
            expect((await api("get", "/lists", `Bearer ${narrow.key}`)).body).toEqual([
                { uid: otherList, name: "Deals", publicName: "Deals" },
                { uid: listUid, name: "News", publicName: "Acme News" },
            ]);
            // A revoked key stops working.
            await change("apiKey", narrow.uid, { revokedAt: new Date() });
            expect((await api("get", "/lists", `Bearer ${narrow.key}`)).status).toBe(401);
            // Use is stamped, at most once a minute.
            await api("get", "/lists", bearer);
            const stamped = (await row("apiKey", key.uid)).lastUsedAt;
            expect(stamped).toBeTruthy();
            await api("get", "/lists", bearer);
            expect((await row("apiKey", key.uid)).lastUsedAt).toEqual(stamped);

            // Contacts: created, then updated.
            expect((await api("post", "/contacts", bearer, { firstName: "Ann" })).status).toBe(400);
            expect((await api("post", "/contacts", bearer, "x")).status).toBe(400);
            const created = await api("post", "/contacts", bearer, { email: "Ann@X.example", firstName: "Ann", tags: ["api"] });
            expect(created.body.outcome).toBe("created");
            const updated = await api("post", "/contacts", bearer, { email: "ann@x.example", lastName: "Lee" });
            expect(updated.body).toEqual({ outcome: "updated", uid: created.body.uid });
            expect(await row("contact", created.body.uid)).toMatchObject({ email: "ann@x.example", firstName: "Ann", lastName: "Lee" });

            // Subscribing.
            expect((await api("post", "/subscribe", bearer, { email: "bob@x.example", listUid: "nope" })).status).toBe(400);
            const subscribed = await api("post", "/subscribe", bearer, { email: "bob@x.example", listUid, firstName: "Bob" });
            expect(subscribed.body.status).toBe("subscribed");
            await api("post", "/subscribe", bearer, { email: "bob@x.example", listUid: otherList });
            const subscriptions = async () =>
                (await (await ctx.repo("subscription")).find({ contactUid: subscribed.body.contactUid }, { ignoreACL: true, limit: 10, skipCache: true }))
                    .map((entry: any) => [entry.listUid === listUid ? "News" : "Deals", entry.status, entry.source])
                    .sort();
            expect(await subscriptions()).toEqual([
                ["Deals", "subscribed", "api"],
                ["News", "subscribed", "api"],
            ]);

            // Unsubscribing: from one list, then from everything; unknown addresses are fine.
            expect((await api("post", "/unsubscribe", bearer, { email: "nobody@x.example" })).body).toEqual({});
            expect((await api("post", "/unsubscribe", bearer, { email: "bob@x.example", listUid: "nope" })).status).toBe(400);
            expect((await api("post", "/unsubscribe", bearer, { email: "bob@x.example", listUid: otherList })).body).toEqual({ contactUid: subscribed.body.contactUid });
            expect((await subscriptions())[0]).toEqual(["Deals", "unsubscribed", "api"]);
            await api("post", "/unsubscribe", bearer, { email: "bob@x.example" });
            expect((await subscriptions()).map((entry) => entry[1])).toEqual(["unsubscribed", "unsubscribed"]);
            expect((await row("contact", subscribed.body.contactUid)).emailStatus).toBe("unsubscribed");
            expect((await api("post", "/unsubscribe", bearer, { email: "bob@x.example" })).status).toBe(200);

            // Events.
            for (const body of [{ email: "c@x.example" }, { email: "c@x.example", name: "x", data: "text" }, { email: "c@x.example", name: "x", data: { blob: "x".repeat(17 * 1024) } }]) {
                expect((await api("post", "/events", bearer, body)).status).toBe(400);
            }
            const reported = await api("post", "/events", bearer, { email: "cat@x.example", name: "order.placed", data: { total: 42 } });
            const events = await (await ctx.repo("crmEvent")).find({ contactUid: reported.body.contactUid, type: "custom" }, { ignoreACL: true, limit: 10 });
            expect(events.map((event: any) => event.data)).toEqual([{ total: 42, name: "order.placed" }]);
            await api("post", "/events", bearer, { email: "cat@x.example", name: "order.shipped" });
            expect(await (await ctx.repo("crmEvent")).find({ contactUid: reported.body.contactUid, type: "custom" }, { ignoreACL: true, limit: 10 })).toHaveLength(2);
        });

        it("reports email, growth and sales by day", async () => {
            const today: string = new Date().toISOString().slice(0, 10);
            expect(lastDays(3, new Date("2026-03-01T12:00:00Z"))).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
            for (const query of ["?days=0", "?days=366", "?days=1.5", "?days=x"]) {
                expect((await call(ctx, "get", `/analytics/${workspaceUid}/email${query}`, ctx.users.viewer)).status).toBe(400);
            }
            expect((await call(ctx, "get", `/analytics/${workspaceUid}/email`, ctx.users.stranger)).status).toBe(404);

            // Email: messages and what happened to them.
            const ann = await contact("ann@gmail.example");
            const bob = await contact("bob@gmail.example");
            const cat = await contact("cat@work.example");
            const classes = ctx.route("AnalyticsRoute").classes;
            const sends = await ctx.repo("outboundSend");
            const send = async (target: any, extra: Record<string, unknown> = {}) =>
                await sends.create(
                    new classes.outboundSend({
                        workspaceUid,
                        sourceType: "campaign",
                        sourceUid: "c",
                        dedupeKey: `campaign:c:${target.uid}`,
                        contactUid: target.uid,
                        email: target.email,
                        variantId: "A",
                        token: `t${target.uid}`.slice(0, 30),
                        status: "sent",
                        sentAt: new Date(),
                        ...extra,
                    }),
                    { ignoreACL: true },
                );
            const annSend = await send(ann, { firstOpenedAt: new Date(), firstClickedAt: new Date() });
            const bobSend = await send(bob, { firstOpenedAt: new Date(), machineOpen: true });
            const catSend = await send(cat);
            const engagement = await ctx.repo("engagementEvent");
            const record = async (sendRow: any, type: string, data: Record<string, unknown> = {}, occurredAt: Date = new Date()) =>
                await engagement.create(
                    new classes.engagementEvent({
                        workspaceUid,
                        sendUid: sendRow.uid,
                        sourceType: "campaign",
                        sourceUid: "c",
                        contactUid: sendRow.contactUid,
                        variantId: "A",
                        type,
                        occurredAt,
                        data,
                    }),
                    { ignoreACL: true },
                );
            for (const sendRow of [annSend, bobSend, catSend]) {
                await record(sendRow, "sent");
            }
            await record(annSend, "opened");
            await record(annSend, "opened");
            await record(annSend, "clicked");
            await record(bobSend, "opened", { machine: true });
            await record(catSend, "bounced");
            await record(catSend, "complained");
            await record(annSend, "sent", {}, new Date(Date.now() - 40 * 86_400_000));
            const email = (await call(ctx, "get", `/analytics/${workspaceUid}/email?days=7`, ctx.users.viewer)).body;
            expect(email.days).toHaveLength(7);
            expect(email.days[6]).toEqual({ date: today, sent: 3, opened: 1, clicked: 1, replied: 0, bounced: 1, unsubscribed: 0 });
            expect(email.days[0].sent).toBe(0);
            expect(email.totals).toEqual({ sent: 3, opened: 1, clicked: 1, replied: 0, bounced: 1, unsubscribed: 0, complained: 1 });
            expect(email.domains).toEqual([
                { domain: "gmail.example", sent: 2, opened: 1, clicked: 1 },
                { domain: "work.example", sent: 1, opened: 0, clicked: 0 },
            ]);
            expect((await call(ctx, "get", `/analytics/${workspaceUid}/email`, ctx.users.viewer)).body.days).toHaveLength(30);

            // Growth: new contacts, subscribes and unsubscribes, and each list's subscribers.
            const listUid = (await call(ctx, "post", `/lists/${workspaceUid}`, ctx.users.owner, { name: "News" })).body.uid;
            await call(ctx, "post", `/subscriptions/${workspaceUid}`, ctx.users.editor, { listUid, contactUids: [ann.uid, bob.uid], status: "subscribed" });
            await call(ctx, "post", `/subscriptions/${workspaceUid}`, ctx.users.editor, { listUid, contactUids: [bob.uid], status: "unsubscribed" });
            const growth = (await call(ctx, "get", `/analytics/${workspaceUid}/growth?days=2`, ctx.users.viewer)).body;
            expect(growth.days).toEqual([
                { date: lastDays(2)[0], contacts: 0, subscribed: 0, unsubscribed: 0 },
                { date: today, contacts: 3, subscribed: 2, unsubscribed: 1 },
            ]);
            expect(growth.contacts).toBe(3);
            expect(growth.lists).toEqual([{ uid: listUid, name: "News", subscribed: 1 }]);

            // Sales: created, won and lost deals, and what is open.
            const pipeline = (await call(ctx, "get", `/pipelines/${workspaceUid}`, ctx.users.viewer)).body[0];
            const stage = (kind: string) => pipeline.stages.find((entry: any) => entry.kind === kind).id;
            const deal = async (amount: number, kind?: string) => {
                const created = (await call(ctx, "post", `/deals/${workspaceUid}`, ctx.users.editor, { name: "D", amount })).body;
                if (kind) {
                    await call(ctx, "put", `/deals/${workspaceUid}/${created.uid}`, ctx.users.editor, { stageId: stage(kind) });
                }
            };
            await deal(100);
            await deal(250, "won");
            await deal(50, "won");
            await deal(75, "lost");
            const sales = (await call(ctx, "get", `/analytics/${workspaceUid}/sales?days=1`, ctx.users.viewer)).body;
            expect(sales).toEqual({ days: [{ date: today, created: 4, won: 2, wonAmount: 300, lost: 1 }], open: { count: 1, amount: 100 }, won: { count: 2, amount: 300 }, lost: 1 });
            const partners = (await call(ctx, "post", `/pipelines/${workspaceUid}`, ctx.users.owner, { name: "Partners" })).body;
            const empty = (await call(ctx, "get", `/analytics/${workspaceUid}/sales?days=1&pipelineUid=${partners.uid}`, ctx.users.viewer)).body;
            expect(empty).toMatchObject({ open: { count: 0, amount: 0 }, won: { count: 0, amount: 0 }, lost: 0 });
            expect((await call(ctx, "get", `/analytics/${workspaceUid}/sales?days=1&pipelineUid=`, ctx.users.viewer)).body.open.count).toBe(1);
        });

        it("pages through big reports, stopping at the row limit", async () => {
            expect(MAX_REPORT_ROWS).toBeGreaterThan(1000);
            const route = ctx.route("AnalyticsRoute");
            const pages: number[] = [];
            const fakeRepo = (size: number) => ({
                find: async () => {
                    pages.push(size);
                    return Array.from({ length: size }, (_value, index) => ({ uid: `u${pages.length}-${index}`, dateCreated: new Date(), status: "open", amount: 1 }));
                },
                count: async () => 0,
            });
            // Full pages keep reading until the limit.
            const all = await route.all(fakeRepo(1000), {});
            expect(all).toHaveLength(MAX_REPORT_ROWS);
        });

        it("lets deployment administrators see workspaces and stop their sending", async () => {
            for (const [method, path] of [
                ["get", "/admin/stats"],
                ["get", "/admin/workspaces"],
                ["put", `/admin/workspaces/${workspaceUid}`],
            ] as const) {
                expect((await call(ctx, method, path, ctx.users.owner, { sendingDisabled: true })).status).toBe(403);
                expect((await call(ctx, method, path, null, { sendingDisabled: true })).status).toBe(403);
            }
            await contact("ann@x.example");
            const stats = (await call(ctx, "get", "/admin/stats", ctx.users.admin)).body;
            expect(stats).toMatchObject({ workspaces: 1, contacts: 1, sentLastDay: 0, queued: 0 });
            const other = await setUpWorkspace(ctx, "Other");
            const listed = (await call(ctx, "get", "/admin/workspaces", ctx.users.admin)).body;
            expect(listed.total).toBe(2);
            expect(listed.items.map((entry: any) => [entry.name, entry.members, entry.contacts, entry.campaignsSent, entry.sendingDisabled])).toEqual([
                ["Other", 3, 0, 0, false],
                ["Acme Sales", 3, 1, 0, false],
            ]);
            expect((await call(ctx, "get", "/admin/workspaces?limit=1&page=1", ctx.users.admin)).body.items.map((entry: any) => entry.uid)).toEqual([workspaceUid]);
            expect((await call(ctx, "get", "/admin/workspaces?limit=500", ctx.users.admin)).status).toBe(400);

            expect((await call(ctx, "put", `/admin/workspaces/${workspaceUid}`, ctx.users.admin, {})).status).toBe(400);
            expect((await call(ctx, "put", `/admin/workspaces/${workspaceUid}`, ctx.users.admin, { sendingDisabled: "yes" })).status).toBe(400);
            expect((await call(ctx, "put", "/admin/workspaces/nope", ctx.users.admin, { sendingDisabled: true })).status).toBe(404);
            expect((await call(ctx, "put", `/admin/workspaces/${workspaceUid}`, ctx.users.admin, { sendingDisabled: true })).body).toEqual({ uid: workspaceUid, sendingDisabled: true });
            expect((await call(ctx, "get", "/admin/workspaces", ctx.users.admin)).body.items.find((entry: any) => entry.uid === workspaceUid).sendingDisabled).toBe(true);

            // A stopped workspace's messages stay queued, looked at again later; another workspace's go on.
            const classes = ctx.route("CrmAdminRoute").classes;
            const sends = await ctx.repo("outboundSend");
            const queue = async (workspace: string) =>
                await sends.create(
                    new classes.outboundSend({
                        workspaceUid: workspace,
                        sourceType: "automation",
                        sourceUid: "gone",
                        dedupeKey: `automation:gone:${workspace}`,
                        contactUid: "c",
                        email: "c@x.example",
                        variantId: "A",
                        token: `tok${workspace}`.slice(0, 30),
                        nextAttemptAt: new Date(Date.now() - 1000),
                    }),
                    { ignoreACL: true },
                );
            const stopped = await queue(workspaceUid);
            const going = await queue(other);
            expect((await call(ctx, "get", "/admin/stats", ctx.users.admin)).body.queued).toBe(2);
            await (await ctx.job("send")).run();
            const held = await row("outboundSend", stopped.uid);
            expect(held.status).toBe("queued");
            expect(new Date(held.nextAttemptAt).getTime()).toBeGreaterThan(Date.now() + STOPPED_RETRY_MS - 60_000);
            expect((await row("outboundSend", going.uid)).status).toBe("cancelled");

            await call(ctx, "put", `/admin/workspaces/${workspaceUid}`, ctx.users.admin, { sendingDisabled: false });
            await change("outboundSend", stopped.uid, { nextAttemptAt: new Date(Date.now() - 1000) });
            await (await ctx.job("send")).run();
            expect((await row("outboundSend", stopped.uid)).status).toBe("cancelled");
        });
    });
}
