///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// CSV imports and `CrmImportJob` - identical on both backends.
import { request } from "@rapidrest/service-core/test";
import { CrmTestContext, TestUser, call, setUpWorkspace } from "./context.js";

export function importSuite(ctx: CrmTestContext): void {
    describe("imports", () => {
        let workspaceUid: string;

        beforeEach(async () => {
            workspaceUid = await setUpWorkspace(ctx);
            await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, { objectType: "contact", key: "seats", label: "Seats", type: "number" });
            await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, { objectType: "contact", key: "beta", label: "Beta", type: "boolean" });
            await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, {
                objectType: "contact",
                key: "interests",
                label: "Interests",
                type: "multi_select",
                options: ["mail", "crm"],
            });
            await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, { objectType: "contact", key: "since", label: "Customer since", type: "date" });
        });

        const upload = (csv: string, query: string = "objectType=contact&fileName=people.csv", user: TestUser = ctx.users.editor) =>
            request(ctx.app())
                .post(`${ctx.prefix}/imports/${workspaceUid}?${query}`)
                .set("Authorization", `jwt ${user.token}`)
                .set("Content-Type", "text/csv")
                .send(Buffer.from(csv));

        const runJob = async () => {
            const job = await ctx.importJob();
            job.start();
            await job.run();
            job.stop();
        };

        it("uploads a CSV, suggests a mapping, and imports it in the background with tags, properties and companies", async () => {
            await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email: "old@x.example", firstName: "Old", tags: ["existing"] });
            const csv =
                "﻿E-mail;First Name;Surname;Company;Seats;Beta;Interests;Customer since;Tags;Ignored\r\n" +
                "ann@x.example;Ann;Archer;Acme;10;yes;crm,mail;2025-01-02;vip;x\r\n" +
                "old@x.example;Olly;;Acme;;;;;newsletter;\r\n" +
                "bad-address;Bad;;;;;;;;\r\n" +
                "cat@x.example;Cat;;Beta Inc;lots;;;;;\r\n" +
                "dan@x.example;Dan;;;;maybe;;;;\r\n" +
                "\r\n";
            const uploaded = await upload(csv);
            expect(uploaded.status).toBe(200);
            expect(uploaded.body.import).toMatchObject({ status: "uploaded", totalRows: 5, fileName: "people.csv", objectType: "contact" });
            expect(uploaded.body.import.columns[0]).toBe("E-mail");
            expect(uploaded.body.preview).toHaveLength(5);
            expect(uploaded.body.targets).toEqual(expect.arrayContaining(["email", "tags", "company", "properties.seats"]));
            const suggested: Record<string, string | undefined> = Object.fromEntries(
                uploaded.body.import.mapping.map((entry: any) => [entry.column, entry.target]),
            );
            expect(suggested).toEqual({
                "E-mail": "email",
                "First Name": "firstName",
                Surname: "lastName",
                Company: "company",
                Seats: "properties.seats",
                Beta: "properties.beta",
                Interests: "properties.interests",
                "Customer since": "properties.since",
                Tags: "tags",
                Ignored: undefined,
            });

            const uid: string = uploaded.body.import.uid;
            const started = await call(ctx, "post", `/imports/${workspaceUid}/${uid}/start`, ctx.users.editor, {
                mapping: uploaded.body.import.mapping,
                tags: ["Imported"],
            });
            expect(started.status).toBe(200);
            expect(started.body.status).toBe("queued");
            expect((await call(ctx, "post", `/imports/${workspaceUid}/${uid}/start`, ctx.users.editor, { mapping: uploaded.body.import.mapping })).status).toBe(400);

            await runJob();

            const finished = await call(ctx, "get", `/imports/${workspaceUid}/${uid}`, ctx.users.editor);
            expect(finished.body).toMatchObject({ status: "done", processedRows: 5, createdCount: 1, updatedCount: 1, skippedCount: 3 });
            expect(finished.body.errors.map((error: any) => error.row)).toEqual([4, 5, 6]);
            expect(finished.body.errors[0].message).toContain("email");
            expect(finished.body.errors[1].message).toContain("Seats");
            expect(finished.body.errors[2].message).toContain("Beta");

            const found = await call(ctx, "post", `/contacts/${workspaceUid}/search`, ctx.users.viewer, { sort: { field: "email" } });
            const byEmail = Object.fromEntries(found.body.items.map((contact: any) => [contact.email, contact]));
            expect(Object.keys(byEmail)).toEqual(["ann@x.example", "old@x.example"]);
            expect(byEmail["ann@x.example"]).toMatchObject({
                firstName: "Ann",
                lastName: "Archer",
                tags: ["imported", "vip"],
                properties: { seats: 10, beta: true, interests: ["crm", "mail"], since: "2025-01-02T00:00:00.000Z" },
            });
            // An existing contact is updated, keeping its tags; its empty cells change nothing.
            expect(byEmail["old@x.example"]).toMatchObject({ firstName: "Olly", tags: ["existing", "imported", "newsletter"] });
            const acme = await call(ctx, "post", `/companies/${workspaceUid}/search`, ctx.users.viewer, { q: "Acme" });
            expect(acme.body.total).toBe(1);
            expect(byEmail["ann@x.example"].companyUid).toBe(acme.body.items[0].uid);
            expect(byEmail["old@x.example"].companyUid).toBe(acme.body.items[0].uid);
            const timeline = await call(ctx, "get", `/timeline/${workspaceUid}/contact/${byEmail["ann@x.example"].uid}`, ctx.users.viewer);
            expect(timeline.body[0].actorUserUid).toBe(ctx.users.editor.uid);
            expect(ctx.pushed().some((message) => message.type === "CrmImport" && message.data.status === "done")).toBe(true);

            // A finished import can be deleted, with its file.
            expect(ctx.blobStore().blobs.size).toBe(1);
            expect((await call(ctx, "get", `/imports/${workspaceUid}`, ctx.users.editor)).body).toHaveLength(1);
            expect((await call(ctx, "delete", `/imports/${workspaceUid}/${uid}`, ctx.users.editor)).status).toBe(204);
            expect(ctx.blobStore().blobs.size).toBe(0);
        });

        it("skips existing records when told not to update them, and imports companies", async () => {
            await call(ctx, "post", `/companies/${workspaceUid}`, ctx.users.editor, { name: "Acme", domain: "acme.example", city: "Paris" });
            const uploaded = await upload("Name,Domain,Employees\nAcme Corp,www.acme.example,50\nGlobex,globex.example,1,000\nInitech,,12\n", "objectType=company");
            expect(uploaded.status).toBe(200);
            const started = await call(ctx, "post", `/imports/${workspaceUid}/${uploaded.body.import.uid}/start`, ctx.users.editor, {
                mapping: [
                    { column: "Name", target: "name" },
                    { column: "Domain", target: "domain" },
                    { column: "Employees", target: "employeeCount" },
                ],
                updateExisting: false,
            });
            expect(started.body.updateExisting).toBe(false);

            await runJob();

            const finished = await call(ctx, "get", `/imports/${workspaceUid}/${uploaded.body.import.uid}`, ctx.users.editor);
            // "Globex" has a fourth cell (an unquoted comma), which is ignored: the mapping only reads the first three columns.
            expect(finished.body).toMatchObject({ status: "done", createdCount: 2, updatedCount: 0, skippedCount: 1 });
            const names = (await call(ctx, "post", `/companies/${workspaceUid}/search`, ctx.users.viewer, { sort: { field: "name" } })).body.items.map(
                (company: any) => [company.name, company.employeeCount ?? null],
            );
            expect(names).toEqual([
                ["Acme", null],
                ["Globex", 1],
                ["Initech", 12],
            ]);
        });

        it("refuses bad uploads and mappings", async () => {
            expect((await upload("email\na@x.example", "objectType=deal")).status).toBe(400);
            expect((await upload("")).status).toBe(400);
            expect((await upload("email\n")).status).toBe(400);
            expect((await upload('email\n"unterminated')).status).toBe(400);
            expect((await upload("email,email\na,b")).status).toBe(400);
            expect((await upload("email\na@x.example", "objectType=contact", ctx.users.viewer)).status).toBe(403);
            // A blank header gets a name.
            const unnamed = await upload("email,\na@x.example,1", "objectType=contact");
            expect(unnamed.body.import.columns).toEqual(["email", "Column 2"]);
            expect(unnamed.body.import.fileName).toBe("import.csv");

            const uid: string = unnamed.body.import.uid;
            const start = (mapping: unknown) => call(ctx, "post", `/imports/${workspaceUid}/${uid}/start`, ctx.users.editor, { mapping });
            expect((await start("email")).status).toBe(400);
            expect((await start([{ column: "nope", target: "email" }])).status).toBe(400);
            expect((await start([{ column: "email", target: "salary" }])).status).toBe(400);
            expect((await start([{ column: "Column 2", target: "firstName" }])).status).toBe(400);
            expect(
                (
                    await start([
                        { column: "email", target: "email" },
                        { column: "Column 2", target: "email" },
                    ])
                ).status,
            ).toBe(400);
            expect((await start([{ column: "email", target: "email" }, { column: "Column 2" }])).status).toBe(200);
            expect((await call(ctx, "get", `/imports/${workspaceUid}/nope`, ctx.users.editor)).status).toBe(404);
            expect((await call(ctx, "get", `/imports/${workspaceUid}/${uid}`, ctx.users.viewer)).status).toBe(403);
        });

        it("resumes an import whose replica died, gives up after too many tries, and never deletes one that is running", async () => {
            const uploaded = await upload("email\na@x.example\nb@x.example\n");
            const uid: string = uploaded.body.import.uid;
            await call(ctx, "post", `/imports/${workspaceUid}/${uid}/start`, ctx.users.editor, { mapping: [{ column: "email", target: "email" }] });
            const repo = await ctx.repo("import");
            // As a replica that died after one row would have left it: running, with an expired lease.
            const stored = await repo.findOne(uid, { ignoreACL: true, skipCache: true });
            await repo.update(
                { uid, version: stored.version, status: "running", processedRows: 1, createdCount: 1, attempts: 1, leaseExpiresAt: new Date(Date.now() + 60000) },
                stored,
                { ignoreACL: true },
            );
            expect((await call(ctx, "delete", `/imports/${workspaceUid}/${uid}`, ctx.users.editor)).status).toBe(400);
            // Still leased: nothing happens.
            await runJob();
            expect((await repo.findOne(uid, { ignoreACL: true, skipCache: true })).processedRows).toBe(1);

            const leased = await repo.findOne(uid, { ignoreACL: true, skipCache: true });
            await repo.update({ uid, version: leased.version, leaseExpiresAt: new Date(Date.now() - 1000) }, leased, { ignoreACL: true });
            await runJob();
            const resumed = await repo.findOne(uid, { ignoreACL: true, skipCache: true });
            expect(resumed).toMatchObject({ status: "done", processedRows: 2, createdCount: 2, attempts: 2 });
            // Only the second row was imported again.
            expect((await call(ctx, "post", `/contacts/${workspaceUid}/search`, ctx.users.viewer, {})).body.total).toBe(1);

            await repo.update(
                { uid, version: resumed.version, status: "running", attempts: 3, leaseExpiresAt: new Date(Date.now() - 1000) },
                resumed,
                { ignoreACL: true },
            );
            await runJob();
            const failed = await repo.findOne(uid, { ignoreACL: true, skipCache: true });
            expect(failed.status).toBe("failed");
            expect(failed.errors.at(-1).message).toContain("given up");
        });
    });
}
