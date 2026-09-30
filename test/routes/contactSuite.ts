///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Contacts and companies: CRUD, custom properties, tags, filters, bulk actions and export - identical on both backends.
import { CrmTestContext, call, setUpWorkspace } from "./context.js";

export function contactSuite(ctx: CrmTestContext): void {
    describe("contacts and companies", () => {
        contactTests(ctx);
    });
}

function contactTests(ctx: CrmTestContext): void {
    let workspaceUid: string;
    const contacts = (path: string = "") => `/contacts/${workspaceUid}${path}`;
    const companies = (path: string = "") => `/companies/${workspaceUid}${path}`;
    const properties = (path: string = "") => `/properties/${workspaceUid}${path}`;

    beforeEach(async () => {
        workspaceUid = await setUpWorkspace(ctx);
    });

    /** Defines the custom properties the filter tests use. */
    const defineProperties = async () => {
        for (const definition of [
            { objectType: "contact", key: "plan", label: "Plan", type: "select", options: ["free", { value: "pro", label: "Pro" }] },
            { objectType: "contact", key: "seats", label: "Seats", type: "number" },
            { objectType: "contact", key: "trial_end", label: "Trial end", type: "date" },
            { objectType: "contact", key: "beta", label: "Beta tester", type: "boolean" },
            { objectType: "contact", key: "interests", label: "Interests", type: "multi_select", options: ["mail", "crm", "calendar"] },
            { objectType: "contact", key: "notes_field", label: "About", type: "text" },
        ]) {
            const created = await call(ctx, "post", properties(), ctx.users.owner, definition);
            expect(created.status).toBe(200);
        }
    };

    const create = async (body: Record<string, unknown>, user = ctx.users.editor) => {
        const created = await call(ctx, "post", contacts(), user, body);
        expect(created.status).toBe(200);
        return created.body;
    };

    const search = async (body: Record<string, unknown>) => {
        const result = await call(ctx, "post", contacts("/search"), ctx.users.viewer, body);
        expect(result.status).toBe(200);
        return result.body;
    };
    const emails = (result: any): string[] => result.items.map((contact: any) => contact.email).sort();

    describe("contacts", () => {
        it("creates, reads, updates and deletes a contact, recording each change on its timeline", async () => {
            const created = await create({
                email: " Jane@Example.com ",
                firstName: "Jane",
                lastName: "Doe",
                phone: "+1 555 0100",
                jobTitle: "CTO",
                lifecycleStage: "lead",
                leadStatus: "new",
                score: 12,
                tags: ["VIP", "vip", "  Early   adopter "],
            });
            expect(created).toMatchObject({
                email: "jane@example.com",
                firstName: "Jane",
                lifecycleStage: "lead",
                score: 12,
                tags: ["vip", "early adopter"],
                source: "manual",
                emailStatus: "active",
                properties: {},
            });
            expect((await call(ctx, "get", contacts(`/${created.uid}`), ctx.users.viewer)).body.email).toBe("jane@example.com");

            const updated = await call(ctx, "put", contacts(`/${created.uid}`), ctx.users.editor, { jobTitle: "CEO", phone: null, version: created.version });
            expect(updated.status).toBe(200);
            expect(updated.body.jobTitle).toBe("CEO");
            expect(updated.body.phone ?? undefined).toBeUndefined();
            // A stale version is a conflict.
            expect((await call(ctx, "put", contacts(`/${created.uid}`), ctx.users.editor, { jobTitle: "x", version: created.version })).status).toBe(409);

            const timeline = await call(ctx, "get", `/timeline/${workspaceUid}/contact/${created.uid}`, ctx.users.viewer);
            expect(timeline.body.map((entry: any) => entry.kind)).toEqual(["updated", "created"]);
            expect(timeline.body[0].data.fields.sort()).toEqual(["jobTitle", "phone"]);

            expect((await call(ctx, "delete", contacts(`/${created.uid}`), ctx.users.editor)).status).toBe(204);
            expect((await call(ctx, "get", contacts(`/${created.uid}`), ctx.users.viewer)).status).toBe(404);
            expect(await (await ctx.repo("propertyValue")).count({}, { ignoreACL: true })).toBe(0);
            expect(await (await ctx.repo("timelineEvent")).count({}, { ignoreACL: true })).toBe(0);
            expect(ctx.pushed().filter((message) => message.type === "CrmContact").map((message) => message.action)).toEqual(["create", "update", "delete"]);
        });

        it("refuses bad contacts: no or duplicate email, bad values, and writes by viewers or outsiders", async () => {
            await create({ email: "a@x.example" });
            for (const body of [
                {},
                { email: "not-an-email" },
                { email: "b@x.example", lifecycleStage: "prospect" },
                { email: "b@x.example", score: 1.5 },
                { email: "b@x.example", tags: "vip" },
                { email: "b@x.example", tags: [""] },
                { email: "b@x.example", firstName: 7 },
                { email: "b@x.example", firstName: "x".repeat(300) },
                { email: "b@x.example", ownerUserUid: ctx.users.stranger.uid },
                { email: "b@x.example", companyUid: "no-such-company" },
                { email: "b@x.example", properties: { missing: 1 } },
                { email: "b@x.example", properties: [] },
            ]) {
                expect((await call(ctx, "post", contacts(), ctx.users.editor, body)).status).toBe(400);
            }
            expect((await call(ctx, "post", contacts(), ctx.users.editor, { email: "A@x.example" })).status).toBe(409);
            expect((await call(ctx, "post", contacts(), ctx.users.viewer, { email: "c@x.example" })).status).toBe(403);
            expect((await call(ctx, "post", contacts(), ctx.users.stranger, { email: "c@x.example" })).status).toBe(404);
            expect((await call(ctx, "post", contacts(), ctx.users.admin, { email: "c@x.example" })).status).toBe(404);
            expect((await call(ctx, "get", contacts("/nope"), ctx.users.viewer)).status).toBe(404);
            const other = await create({ email: "b@x.example" });
            expect((await call(ctx, "put", contacts(`/${other.uid}`), ctx.users.editor, { email: "a@x.example" })).status).toBe(409);
            expect((await call(ctx, "put", contacts(`/${other.uid}`), ctx.users.editor, { email: null })).status).toBe(400);
            // Changing to a free address works.
            expect((await call(ctx, "put", contacts(`/${other.uid}`), ctx.users.editor, { email: "c@x.example", ownerUserUid: ctx.users.viewer.uid })).body).toMatchObject({
                email: "c@x.example",
                ownerUserUid: ctx.users.viewer.uid,
            });
        });

        it("keeps a contact of one workspace out of every other", async () => {
            const contact = await create({ email: "a@x.example" });
            const otherWorkspace: string = (await call(ctx, "post", "/workspaces", ctx.users.stranger, { name: "Other" })).body.uid;

            expect((await call(ctx, "get", `/contacts/${otherWorkspace}/${contact.uid}`, ctx.users.stranger)).status).toBe(404);
            expect((await call(ctx, "put", `/contacts/${otherWorkspace}/${contact.uid}`, ctx.users.stranger, { firstName: "x" })).status).toBe(404);
            expect((await call(ctx, "delete", `/contacts/${otherWorkspace}/${contact.uid}`, ctx.users.stranger)).status).toBe(404);
            expect((await call(ctx, "get", `/contacts/${otherWorkspace}`, ctx.users.stranger)).body).toEqual([]);
        });

        it("stores custom property values, clears them with null, and checks them against their definitions", async () => {
            await defineProperties();
            const contact = await create({
                email: "a@x.example",
                properties: { plan: "pro", seats: 5, trial_end: "2026-12-31T00:00:00.000Z", beta: true, interests: ["crm", "mail", "crm"], notes_field: " hi " },
            });
            expect(contact.properties).toEqual({ plan: "pro", seats: 5, trial_end: "2026-12-31T00:00:00.000Z", beta: true, interests: ["crm", "mail"], notes_field: "hi" });

            const updated = await call(ctx, "put", contacts(`/${contact.uid}`), ctx.users.editor, { properties: { plan: null, beta: false, seats: 6 } });
            expect(updated.body.properties).toEqual({ seats: 6, trial_end: "2026-12-31T00:00:00.000Z", beta: false, interests: ["crm", "mail"], notes_field: "hi" });
            expect((await call(ctx, "get", `/timeline/${workspaceUid}/contact/${contact.uid}`, ctx.users.viewer)).body[0].data.fields.sort()).toEqual([
                "properties.beta",
                "properties.plan",
                "properties.seats",
            ]);

            for (const value of [
                { plan: "enterprise" },
                { seats: "5" },
                { trial_end: "someday" },
                { beta: "yes" },
                { interests: ["crm", "sports"] },
                { interests: "crm" },
                { notes_field: 5 },
            ]) {
                expect((await call(ctx, "put", contacts(`/${contact.uid}`), ctx.users.editor, { properties: value })).status).toBe(400);
            }
            // A failed write changes nothing.
            expect((await call(ctx, "get", contacts(`/${contact.uid}`), ctx.users.viewer)).body.properties.seats).toBe(6);
        });

        it("links a new contact to the company with its email's domain", async () => {
            const acme = await call(ctx, "post", companies(), ctx.users.editor, { name: "Acme", domain: "https://www.Acme.example/about" });
            expect(acme.body.domain).toBe("acme.example");

            expect((await create({ email: "jane@acme.example" })).companyUid).toBe(acme.body.uid);
            expect((await create({ email: "joe@other.example" })).companyUid ?? undefined).toBeUndefined();
            expect((await create({ email: "jim@acme.example", companyUid: null })).companyUid ?? undefined).toBeUndefined();
            const listed = await call(ctx, "get", `${contacts()}?companyUid=${acme.body.uid}`, ctx.users.viewer);
            expect(listed.body.map((contact: any) => contact.email)).toEqual(["jane@acme.example"]);
        });

        it("lists newest first a page at a time", async () => {
            for (const email of ["a@x.example", "b@x.example", "c@x.example"]) {
                await create({ email });
            }
            const firstPage = await call(ctx, "get", `${contacts()}?limit=2&page=0`, ctx.users.viewer);
            const secondPage = await call(ctx, "get", `${contacts()}?limit=2&page=1`, ctx.users.viewer);
            expect([...firstPage.body, ...secondPage.body].map((contact: any) => contact.email).sort()).toEqual(["a@x.example", "b@x.example", "c@x.example"]);
            expect(firstPage.body).toHaveLength(2);
            expect((await call(ctx, "get", `${contacts()}?limit=0`, ctx.users.viewer)).status).toBe(400);
            expect((await call(ctx, "get", `${contacts()}?page=-1`, ctx.users.viewer)).status).toBe(400);
        });
    });

    describe("contact search and filters", () => {
        beforeEach(async () => {
            await defineProperties();
            await create({
                email: "ann@acme.example",
                firstName: "Ann",
                lastName: "Archer",
                lifecycleStage: "customer",
                score: 50,
                tags: ["vip", "newsletter"],
                properties: { plan: "pro", seats: 10, beta: true, interests: ["crm"], trial_end: "2026-01-15T00:00:00.000Z" },
            });
            await create({
                email: "bob@beta.example",
                firstName: "Bob",
                lifecycleStage: "lead",
                score: 20,
                tags: ["newsletter"],
                properties: { plan: "free", seats: 1, beta: false, interests: ["mail", "calendar"] },
            });
            await create({ email: "cat@acme.example", firstName: "Cat", lifecycleStage: "lead", score: 5 });
        });

        it("matches record fields, text, numbers and dates", async () => {
            expect(emails(await search({ filter: { field: "lifecycleStage", op: "eq", value: "lead" } }))).toEqual(["bob@beta.example", "cat@acme.example"]);
            expect(emails(await search({ filter: { field: "lifecycleStage", op: "ne", value: "lead" } }))).toEqual(["ann@acme.example"]);
            expect(emails(await search({ filter: { field: "email", op: "contains", value: "ACME" } }))).toEqual(["ann@acme.example", "cat@acme.example"]);
            expect(emails(await search({ filter: { field: "email", op: "notContains", value: "acme" } }))).toEqual(["bob@beta.example"]);
            expect(emails(await search({ filter: { field: "firstName", op: "startsWith", value: "b" } }))).toEqual(["bob@beta.example"]);
            expect(emails(await search({ filter: { field: "score", op: "gte", value: 20 } }))).toEqual(["ann@acme.example", "bob@beta.example"]);
            expect(emails(await search({ filter: { field: "score", op: "between", value: [5, 20] } }))).toEqual(["bob@beta.example", "cat@acme.example"]);
            expect(emails(await search({ filter: { field: "score", op: "in", value: [5, 50] } }))).toEqual(["ann@acme.example", "cat@acme.example"]);
            expect(emails(await search({ filter: { field: "score", op: "notIn", value: [5, 50] } }))).toEqual(["bob@beta.example"]);
            expect(emails(await search({ filter: { field: "lastName", op: "isSet" } }))).toEqual(["ann@acme.example"]);
            expect(emails(await search({ filter: { field: "lastName", op: "isNotSet" } }))).toEqual(["bob@beta.example", "cat@acme.example"]);
            expect((await search({ filter: { field: "dateCreated", op: "lt", value: "2000-01-01T00:00:00Z" } })).total).toBe(0);
            expect((await search({ filter: { field: "dateCreated", op: "gt", value: "2000-01-01T00:00:00Z" } })).total).toBe(3);
        });

        it("matches tags and custom properties, with negations counting records that have no value", async () => {
            expect(emails(await search({ filter: { field: "tags", op: "eq", value: "VIP" } }))).toEqual(["ann@acme.example"]);
            expect(emails(await search({ filter: { field: "tags", op: "ne", value: "vip" } }))).toEqual(["bob@beta.example", "cat@acme.example"]);
            expect(emails(await search({ filter: { field: "tags", op: "isNotSet" } }))).toEqual(["cat@acme.example"]);
            expect(emails(await search({ filter: { field: "properties.plan", op: "eq", value: "pro" } }))).toEqual(["ann@acme.example"]);
            expect(emails(await search({ filter: { field: "properties.plan", op: "ne", value: "pro" } }))).toEqual(["bob@beta.example", "cat@acme.example"]);
            expect(emails(await search({ filter: { field: "properties.seats", op: "gt", value: 1 } }))).toEqual(["ann@acme.example"]);
            expect(emails(await search({ filter: { field: "properties.beta", op: "eq", value: false } }))).toEqual(["bob@beta.example"]);
            expect(emails(await search({ filter: { field: "properties.interests", op: "in", value: ["calendar", "crm"] } }))).toEqual([
                "ann@acme.example",
                "bob@beta.example",
            ]);
            expect(emails(await search({ filter: { field: "properties.interests", op: "notIn", value: ["crm"] } }))).toEqual(["bob@beta.example", "cat@acme.example"]);
            expect(emails(await search({ filter: { field: "properties.trial_end", op: "lt", value: "2026-02-01T00:00:00Z" } }))).toEqual(["ann@acme.example"]);
            expect(emails(await search({ filter: { field: "properties.trial_end", op: "isSet" } }))).toEqual(["ann@acme.example"]);
            expect(emails(await search({ filter: { field: "properties.seats", op: "isNotSet" } }))).toEqual(["cat@acme.example"]);
        });

        it("combines conditions with and/or groups, a quick text search, sorting and paging", async () => {
            const filter = {
                or: [
                    { and: [{ field: "tags", op: "eq", value: "newsletter" }, { field: "score", op: "lt", value: 30 }] },
                    { field: "email", op: "startsWith", value: "cat" },
                ],
            };
            expect(emails(await search({ filter }))).toEqual(["bob@beta.example", "cat@acme.example"]);
            expect(emails(await search({ q: "acme" }))).toEqual(["ann@acme.example", "cat@acme.example"]);
            expect(emails(await search({ q: "ann", filter: { field: "tags", op: "eq", value: "vip" } }))).toEqual(["ann@acme.example"]);
            expect(emails(await search({ q: "*()" }))).toHaveLength(3);

            const sorted = await search({ sort: { field: "score", direction: "desc" }, limit: 2 });
            expect(sorted.total).toBe(3);
            expect(sorted.items.map((contact: any) => contact.score)).toEqual([50, 20]);
            const next = await search({ sort: { field: "score", direction: "desc" }, limit: 2, page: 1 });
            expect(next.items.map((contact: any) => contact.score)).toEqual([5]);
            expect((await search({ sort: { field: "email" } })).items.map((contact: any) => contact.email)).toEqual([
                "ann@acme.example",
                "bob@beta.example",
                "cat@acme.example",
            ]);
        });

        it("refuses malformed filters, sorts and searches", async () => {
            for (const body of [
                { filter: "x" },
                { filter: { field: "salary", op: "eq", value: 1 } },
                { filter: { field: "score", op: "contains", value: "1" } },
                { filter: { field: "score", op: "eq", value: "1" } },
                { filter: { field: "email", op: "matches", value: "x" } },
                { filter: { field: "email", op: "eq", value: "" } },
                { filter: { field: "dateCreated", op: "gt", value: "whenever" } },
                { filter: { field: "properties.beta", op: "eq", value: "yes" } },
                { filter: { field: "properties.plan", op: "eq", value: "gold" } },
                { filter: { field: "tags", op: "contains", value: "v" } },
                { filter: { field: "score", op: "between", value: [1] } },
                { filter: { field: "score", op: "in", value: [] } },
                { filter: { and: [] } },
                { filter: { and: [{ field: "score", op: "isSet" }], or: [{ field: "score", op: "isSet" }] } },
                { filter: { and: [{ and: [{ and: [{ and: [{ and: [{ and: [{ field: "score", op: "isSet" }] }] }] }] }] }] } },
                { filter: { or: Array.from({ length: 60 }, () => ({ field: "score", op: "isSet" })) } },
                { q: 5 },
                { sort: { field: "phone" } },
                { sort: { field: "score", direction: "up" } },
                { sort: "score" },
            ]) {
                expect((await call(ctx, "post", contacts("/search"), ctx.users.viewer, body)).status).toBe(400);
            }
            expect((await call(ctx, "post", contacts("/search"), ctx.users.stranger, {})).status).toBe(404);
            // No body at all is an unfiltered search.
            expect((await call(ctx, "post", contacts("/search"), ctx.users.viewer)).body.total).toBe(3);
        });
    });

    describe("contact bulk actions and export", () => {
        it("adds and removes tags, sets the owner, and deletes in bulk", async () => {
            const a = await create({ email: "a@x.example", tags: ["one"] });
            const b = await create({ email: "b@x.example" });
            const uids: string[] = [a.uid, b.uid, "not-a-contact"];

            expect((await call(ctx, "post", contacts("/bulk"), ctx.users.editor, { uids, action: "addTags", tags: ["Two"] })).body).toEqual({ changed: 2 });
            expect((await call(ctx, "get", contacts(`/${a.uid}`), ctx.users.viewer)).body.tags).toEqual(["one", "two"]);
            expect(emails(await search({ filter: { field: "tags", op: "eq", value: "two" } }))).toEqual(["a@x.example", "b@x.example"]);
            await call(ctx, "post", contacts("/bulk"), ctx.users.editor, { uids, action: "removeTags", tags: ["one"] });
            expect((await call(ctx, "get", contacts(`/${a.uid}`), ctx.users.viewer)).body.tags).toEqual(["two"]);
            await call(ctx, "post", contacts("/bulk"), ctx.users.editor, { uids, action: "setOwner", ownerUserUid: ctx.users.editor.uid });
            expect((await call(ctx, "get", contacts(`/${b.uid}`), ctx.users.viewer)).body.ownerUserUid).toBe(ctx.users.editor.uid);
            await call(ctx, "post", contacts("/bulk"), ctx.users.editor, { uids, action: "setOwner", ownerUserUid: null });
            expect((await call(ctx, "get", contacts(`/${b.uid}`), ctx.users.viewer)).body.ownerUserUid ?? undefined).toBeUndefined();

            for (const body of [
                { uids: [], action: "delete" },
                { uids: "a", action: "delete" },
                { uids, action: "explode" },
                { uids, action: "addTags" },
                { uids, action: "setOwner", ownerUserUid: ctx.users.stranger.uid },
                { uids, action: "setOwner" },
            ]) {
                expect((await call(ctx, "post", contacts("/bulk"), ctx.users.editor, body)).status).toBe(400);
            }
            expect((await call(ctx, "post", contacts("/bulk"), ctx.users.viewer, { uids, action: "delete" })).status).toBe(403);
            expect((await call(ctx, "post", contacts("/bulk"), ctx.users.editor, { uids, action: "delete" })).body).toEqual({ changed: 2 });
            expect((await search({})).total).toBe(0);
            expect(await (await ctx.repo("propertyValue")).count({}, { ignoreACL: true })).toBe(0);
        });

        it("exports the matching contacts as CSV, with tags and custom properties, guarded against formulas", async () => {
            await defineProperties();
            await create({ email: "a@x.example", firstName: "=cmd()", tags: ["vip", "b"], properties: { plan: "pro", interests: ["mail", "crm"] } });
            await create({ email: "b@x.example", lastName: "O\"Neil, Jr" });

            const exported = await call(ctx, "post", contacts("/export"), ctx.users.viewer, { filter: { field: "tags", op: "eq", value: "vip" } });
            expect(exported.status).toBe(200);
            expect(exported.headers["content-type"]).toContain("text/csv");
            const lines: string[] = exported.text.replace(/^﻿/, "").trim().split("\r\n");
            expect(lines[0]).toContain("uid,email,firstName,lastName");
            expect(lines[0]).toContain(",tags,properties.plan,properties.seats");
            expect(lines).toHaveLength(2);
            expect(lines[1]).toContain(",a@x.example,'=cmd(),");
            expect(lines[1]).toContain(",vip;b,pro,");
            expect(lines[1]).toContain("crm;mail");

            const all = await call(ctx, "post", contacts("/export"), ctx.users.viewer);
            expect(all.text).toContain('"O""Neil, Jr"');
            expect((await call(ctx, "post", contacts("/export"), ctx.users.stranger, {})).status).toBe(404);
        });
    });

    describe("companies", () => {
        it("creates, updates, searches and deletes companies, unlinking their contacts", async () => {
            const acme = await call(ctx, "post", companies(), ctx.users.editor, {
                name: "Acme",
                domain: "acme.example",
                industry: "Software",
                employeeCount: 120,
                city: "Paris",
                tags: ["target"],
            });
            expect(acme.status).toBe(200);
            expect(acme.body).toMatchObject({ name: "Acme", domain: "acme.example", employeeCount: 120, tags: ["target"], properties: {} });
            const jane = await create({ email: "jane@acme.example" });
            expect(jane.companyUid).toBe(acme.body.uid);

            for (const body of [{}, { name: " " }, { name: "X", domain: "not a domain" }, { name: "X", employeeCount: -1 }]) {
                expect((await call(ctx, "post", companies(), ctx.users.editor, body)).status).toBe(400);
            }
            expect((await call(ctx, "put", companies(`/${acme.body.uid}`), ctx.users.editor, { name: null })).status).toBe(400);
            const updated = await call(ctx, "put", companies(`/${acme.body.uid}`), ctx.users.editor, { domain: null, ownerUserUid: ctx.users.owner.uid });
            expect(updated.body.domain ?? undefined).toBeUndefined();
            expect(updated.body.ownerUserUid).toBe(ctx.users.owner.uid);

            const found = await call(ctx, "post", companies("/search"), ctx.users.viewer, { filter: { field: "employeeCount", op: "gt", value: 100 }, q: "acm" });
            expect(found.body.items.map((company: any) => company.name)).toEqual(["Acme"]);

            expect((await call(ctx, "delete", companies(`/${acme.body.uid}`), ctx.users.editor)).status).toBe(204);
            expect((await call(ctx, "get", contacts(`/${jane.uid}`), ctx.users.viewer)).body.companyUid ?? undefined).toBeUndefined();
            const exported = await call(ctx, "post", companies("/export"), ctx.users.viewer, {});
            expect(exported.text.trim().split("\r\n")).toHaveLength(1);
        });
    });
}
