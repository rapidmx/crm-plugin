///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Limits, failures and odd states the other suites don't reach - identical on both backends.
import { request } from "@rapidrest/service-core/test";
import { CrmRepoUtils } from "../../src/models/CrmModelClasses.js";
import { CrmTestContext, call, setUpWorkspace } from "./context.js";

export function edgeSuite(ctx: CrmTestContext): void {
    describe("limits, failures and odd states", () => {
        let workspaceUid: string;
        /** Restores every route field a test changed. */
        const restore: (() => void)[] = [];
        const setField = (routeName: string, field: string, value: unknown) => {
            const route = ctx.route(routeName);
            const previous: unknown = route[field];
            route[field] = value;
            restore.push(() => {
                route[field] = previous;
            });
        };

        beforeEach(async () => {
            workspaceUid = await setUpWorkspace(ctx);
        });

        afterEach(() => {
            restore.splice(0).forEach((undo) => undo());
            vi.restoreAllMocks();
        });

        describe("workspaces", () => {
            it("limits who may create workspaces, and how many members and senders one has", async () => {
                setField("WorkspaceRoute", "creatorRoles", " crm-admins , ");
                expect((await call(ctx, "post", "/workspaces", ctx.users.stranger, { name: "x" })).status).toBe(403);

                setField("WorkspaceRoute", "maxMembers", 3);
                expect((await call(ctx, "post", `/workspaces/${workspaceUid}/members`, ctx.users.owner, { userUid: ctx.users.stranger.uid, role: "viewer" })).status).toBe(400);

                setField("WorkspaceRoute", "maxSenders", 1);
                await ctx.createMailbox(ctx.users.owner.uid, "a@acme.example");
                await ctx.createMailbox(ctx.users.owner.uid, "b@acme.example");
                const first = await call(ctx, "post", `/workspaces/${workspaceUid}/senders`, ctx.users.owner, { fromAddress: "a@acme.example" });
                // With no name given, the sender takes the mailbox's.
                expect(first.body.fromName).toBe("Mailbox of a@acme.example");
                expect((await call(ctx, "post", `/workspaces/${workspaceUid}/senders`, ctx.users.owner, { fromAddress: "b@acme.example" })).status).toBe(400);

                const path = `/workspaces/${workspaceUid}/senders/${first.body.uid}`;
                expect((await call(ctx, "put", path, ctx.users.owner, { fromName: null })).body.fromName).toBe("");
                expect((await call(ctx, "put", path, ctx.users.owner, {})).body.fromName).toBe("");
            });

            it("honours an update's version, and copes with membership rows and workspaces that went missing", async () => {
                const current = (await call(ctx, "get", `/workspaces/${workspaceUid}`, ctx.users.owner)).body;
                expect((await call(ctx, "put", `/workspaces/${workspaceUid}`, ctx.users.owner, { name: "x", version: current.version + 5 })).status).toBe(409);

                // A member whose membership row is gone (but whose ACL record isn't) reads as a viewer.
                const members = await ctx.repo("workspaceMember");
                const editorRow = (await members.find({ userUid: ctx.users.editor.uid }, { ignoreACL: true, skipCache: true }))[0];
                await members.delete(editorRow.uid, { ignoreACL: true, purge: true });
                expect((await call(ctx, "get", `/workspaces/${workspaceUid}`, ctx.users.editor)).body.role).toBe("viewer");

                // A workspace row that is gone is left out of its members' lists, and is a 404.
                const other: string = (await call(ctx, "post", "/workspaces", ctx.users.owner, { name: "Other" })).body.uid;
                await (await ctx.repo("workspace")).delete(workspaceUid, { ignoreACL: true, purge: true });
                expect((await call(ctx, "get", "/workspaces", ctx.users.owner)).body.map((workspace: any) => workspace.uid)).toEqual([other]);
                expect((await call(ctx, "put", `/workspaces/${other}`, ctx.users.owner, { name: "y" })).status).toBe(200);
                // Deleting the row took its ACL with it: the workspace is gone for everyone.
                expect((await call(ctx, "put", `/workspaces/${workspaceUid}`, ctx.users.owner, { name: "y" })).status).toBe(404);
            });

            it("lets an owner remove another owner, and retries an ACL change that lost a race", async () => {
                const path = `/workspaces/${workspaceUid}/members`;
                await call(ctx, "put", `${path}/${ctx.users.viewer.uid}`, ctx.users.owner, { role: "owner" });
                const aclUtils = ctx.route("WorkspaceRoute").aclUtils;
                const save = vi.spyOn(aclUtils, "saveACL").mockRejectedValueOnce(new Error("The ACL must be of the same version."));

                expect((await call(ctx, "delete", `${path}/${ctx.users.viewer.uid}`, ctx.users.owner)).status).toBe(204);
                expect(save).toHaveBeenCalledTimes(2);

                save.mockRejectedValueOnce(new Error("disk full"));
                expect((await call(ctx, "put", `${path}/${ctx.users.editor.uid}`, ctx.users.owner, { role: "admin" })).status).toBe(500);
            });
        });

        describe("records", () => {
            it("limits a workspace's records, exports in pages, and refuses an export that is too big", async () => {
                for (const email of ["a@x.example", "b@x.example", "c@x.example"]) {
                    await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email });
                }
                setField("ContactRoute", "exportPageSize", 2);
                const exported = await call(ctx, "post", `/contacts/${workspaceUid}/export`, ctx.users.viewer, {});
                expect(exported.text.trim().split("\r\n")).toHaveLength(4);
                setField("ContactRoute", "maxExportRows", 2);
                expect((await call(ctx, "post", `/contacts/${workspaceUid}/export`, ctx.users.viewer, {})).status).toBe(400);

                setField("ContactRoute", "maxRecords", 3);
                const over = await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email: "d@x.example" });
                expect(over.status).toBe(400);
                expect(over.body.message).toContain("at most 3");
            });

            it("refuses a bulk tag that would take a record past the tag limit", async () => {
                const tags: string[] = Array.from({ length: 50 }, (_value, index) => `t${index}`);
                const contact = (await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email: "a@x.example", tags })).body;
                const result = await call(ctx, "post", `/contacts/${workspaceUid}/bulk`, ctx.users.editor, { uids: [contact.uid], action: "addTags", tags: ["one-more"] });
                expect(result.status).toBe(400);
                // Deleting records that aren't there changes nothing.
                expect((await call(ctx, "post", `/contacts/${workspaceUid}/bulk`, ctx.users.editor, { uids: ["nope"], action: "delete" })).body).toEqual({ changed: 0 });
            });

            it("sets and clears a contact's email status and score, and links no company for an address with an unusual domain", async () => {
                const contact = (await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email: "a@under_score.example", emailStatus: "unsubscribed" })).body;
                expect(contact).toMatchObject({ emailStatus: "unsubscribed" });
                expect(contact.companyUid ?? undefined).toBeUndefined();
                expect((await call(ctx, "put", `/contacts/${workspaceUid}/${contact.uid}`, ctx.users.editor, { score: 9 })).body.score).toBe(9);
                expect((await call(ctx, "put", `/contacts/${workspaceUid}/${contact.uid}`, ctx.users.editor, { score: null })).body.score).toBe(0);
            });

            it("lists companies, answers a 404 for an overlong uid, and matches a filter that no value fits", async () => {
                await call(ctx, "post", `/companies/${workspaceUid}`, ctx.users.editor, { name: "Acme" });
                expect((await call(ctx, "get", `/companies/${workspaceUid}`, ctx.users.viewer)).body.map((company: any) => company.name)).toEqual(["Acme"]);
                expect((await call(ctx, "get", `/companies/${workspaceUid}/${"x".repeat(65)}`, ctx.users.viewer)).status).toBe(404);
                const everyone = await call(ctx, "post", `/companies/${workspaceUid}/search`, ctx.users.viewer, { filter: { field: "tags", op: "ne", value: "never-used" } });
                expect(everyone.body.total).toBe(1);
                // A list called without a query at all.
                expect(await ctx.route("CompanyRoute").list(workspaceUid, undefined, { uid: ctx.users.viewer.uid })).toHaveLength(1);
            });

            it("still makes a change whose timeline entry can't be written", async () => {
                const original = CrmRepoUtils.prototype.create;
                vi.spyOn(CrmRepoUtils.prototype, "create").mockImplementation(async function (this: any, ...args: any[]) {
                    if (this.modelClass.name.startsWith("TimelineEvent")) {
                        throw new Error("timeline down");
                    }
                    return await original.apply(this, args as any);
                });
                expect((await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email: "a@x.example" })).status).toBe(200);
            });

            it("pages a find by its options' limit, or the query's own", async () => {
                for (const email of ["a@x.example", "b@x.example", "c@x.example"]) {
                    await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email });
                }
                const repo = await ctx.repo("contact");
                expect(await repo.find({ limit: 2 }, { ignoreACL: true, limit: 2, skipCache: true })).toHaveLength(2);
                expect(await repo.find(null, { ignoreACL: true, limit: 2, skipCache: true })).toHaveLength(2);
                expect(await repo.find({ sort: { email: "ASC", uid: "DESC" } }, { ignoreACL: true, skipCache: true })).toHaveLength(3);
            });
        });

        describe("notes and tasks", () => {
            it("edits a note's text or pin alone, lists every note, and deletes a task", async () => {
                const contact = (await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email: "a@x.example" })).body;
                const note = (await call(ctx, "post", `/notes/${workspaceUid}`, ctx.users.editor, { subjectType: "contact", subjectUid: contact.uid, body: "x" })).body;
                const path = `/notes/${workspaceUid}/${note.uid}`;
                expect((await call(ctx, "put", path, ctx.users.editor, { pinned: true, subjectType: "contact" })).body).toMatchObject({ pinned: true, body: "x" });
                expect((await call(ctx, "put", path, ctx.users.editor, { body: "y" })).body).toMatchObject({ pinned: true, body: "y" });
                expect((await call(ctx, "get", `/notes/${workspaceUid}`, ctx.users.viewer)).body).toHaveLength(1);

                const task = (await call(ctx, "post", `/tasks/${workspaceUid}`, ctx.users.editor, { title: "t", subjectType: "contact", subjectUid: contact.uid })).body;
                // Moving the task to another record of the same type, naming only the record.
                const other = (await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email: "b@x.example" })).body;
                expect((await call(ctx, "put", `/tasks/${workspaceUid}/${task.uid}`, ctx.users.editor, { subjectUid: other.uid })).body.subjectUid).toBe(other.uid);
                expect((await call(ctx, "delete", `/tasks/${workspaceUid}/${task.uid}`, ctx.users.editor)).status).toBe(204);
            });
        });

        describe("imports", () => {
            const upload = (csv: string, query: string = "objectType=contact") =>
                request(ctx.app())
                    .post(`${ctx.prefix}/imports/${workspaceUid}?${query}`)
                    .set("Authorization", `jwt ${ctx.users.editor.token}`)
                    .set("Content-Type", "text/csv")
                    .send(Buffer.from(csv));
            const runJob = async () => {
                const job = await ctx.importJob();
                await job.run();
                return job;
            };

            it("refuses a file that is too big, and cleans up the file of an upload that fails", async () => {
                setField("ImportRoute", "maxBytes", 10);
                expect((await upload("email\na@x.example")).status).toBe(413);
                restore.pop()!();

                const original = CrmRepoUtils.prototype.create;
                vi.spyOn(CrmRepoUtils.prototype, "create").mockImplementation(async function (this: any, ...args: any[]) {
                    if (this.modelClass.name.startsWith("CrmImport")) {
                        throw new Error("database down");
                    }
                    return await original.apply(this, args as any);
                });
                ctx.blobStore().failNextDelete = true;
                expect((await upload("email\na@x.example")).status).toBe(500);
                vi.restoreAllMocks();
                expect((await call(ctx, "get", `/imports/${workspaceUid}/${"x".repeat(65)}`, ctx.users.editor)).status).toBe(404);
            });

            it("skips rows without their key field, and updates a record from a row with no tags", async () => {
                await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email: "old@x.example", tags: ["keep"] });
                const contacts = await upload("email,first\nold@x.example,Olly\n,Nobody\n");
                await call(ctx, "post", `/imports/${workspaceUid}/${contacts.body.import.uid}/start`, ctx.users.editor, {
                    mapping: [
                        { column: "email", target: "email" },
                        { column: "first", target: "firstName" },
                    ],
                });
                const companies = await upload("name,city\n,Paris\n", "objectType=company");
                await call(ctx, "post", `/imports/${workspaceUid}/${companies.body.import.uid}/start`, ctx.users.editor, {
                    mapping: [
                        { column: "name", target: "name" },
                        { column: "city", target: "city" },
                    ],
                });
                // Two contact imports in one run use the same route.
                const again = await upload("email\nnew@x.example\n");
                await call(ctx, "post", `/imports/${workspaceUid}/${again.body.import.uid}/start`, ctx.users.editor, { mapping: [{ column: "email", target: "email" }] });

                const job = await runJob();
                expect(job.schedule).toBe("*/5 * * * * *");

                const repo = await ctx.repo("import");
                expect(await repo.findOne(contacts.body.import.uid, { ignoreACL: true, skipCache: true })).toMatchObject({ updatedCount: 1, skippedCount: 1 });
                expect(await repo.findOne(companies.body.import.uid, { ignoreACL: true, skipCache: true })).toMatchObject({ skippedCount: 1 });
                expect(await repo.findOne(again.body.import.uid, { ignoreACL: true, skipCache: true })).toMatchObject({ createdCount: 1 });
                const old = (await call(ctx, "post", `/contacts/${workspaceUid}/search`, ctx.users.viewer, { q: "old@" })).body.items[0];
                expect(old).toMatchObject({ firstName: "Olly", tags: ["keep"] });
            });

            it("finishes an import with no rows, keeps only the first errors, and survives a failing import", async () => {
                const importClass = (await ctx.repo("import")).modelClass;
                const repo = await ctx.repo("import");
                await ctx.blobStore().put("crm-imports/empty", Buffer.from("email\n"));
                const empty = await repo.create(
                    new importClass({ workspaceUid, objectType: "contact", blobKey: "crm-imports/empty", columns: ["email"], mapping: [{ column: "email", target: "email" }], status: "queued", createdByUserUid: ctx.users.editor.uid }),
                    { ignoreACL: true },
                );
                const badRows: string = `email\n${Array.from({ length: 105 }, () => "not-an-address").join("\n")}\n`;
                await ctx.blobStore().put("crm-imports/bad", Buffer.from(badRows));
                const bad = await repo.create(
                    new importClass({ workspaceUid, objectType: "contact", blobKey: "crm-imports/bad", columns: ["email"], mapping: [{ column: "email", target: "email" }], status: "queued", createdByUserUid: ctx.users.editor.uid }),
                    { ignoreACL: true },
                );
                const missing = await repo.create(
                    new importClass({ workspaceUid, objectType: "contact", blobKey: "crm-imports/missing", columns: ["email"], status: "queued", createdByUserUid: ctx.users.editor.uid }),
                    { ignoreACL: true },
                );

                await runJob();

                expect(await repo.findOne(empty.uid, { ignoreACL: true, skipCache: true })).toMatchObject({ status: "done", processedRows: 0 });
                const failed = await repo.findOne(bad.uid, { ignoreACL: true, skipCache: true });
                expect(failed).toMatchObject({ status: "done", skippedCount: 105 });
                expect(failed.errors).toHaveLength(100);
                // The import whose file is gone stays running until its lease runs out, then is retried.
                expect((await repo.findOne(missing.uid, { ignoreACL: true, skipCache: true })).status).toBe("running");
            });

            it("stops when another replica takes the import over, and gives way when it loses the claim", async () => {
                const importClass = (await ctx.repo("import")).modelClass;
                const repo = await ctx.repo("import");
                await ctx.blobStore().put("crm-imports/rows", Buffer.from(`email\n${Array.from({ length: 150 }, (_value, index) => `r${index}@x.example`).join("\n")}\n`));
                const created = await repo.create(
                    new importClass({ workspaceUid, objectType: "contact", blobKey: "crm-imports/rows", columns: ["email"], mapping: [{ column: "email", target: "email" }], status: "queued", createdByUserUid: ctx.users.editor.uid }),
                    { ignoreACL: true },
                );

                // The progress save after 100 rows finds the import changed by someone else.
                const original = CrmRepoUtils.prototype.update;
                let updates = 0;
                vi.spyOn(CrmRepoUtils.prototype, "update").mockImplementation(async function (this: any, ...args: any[]) {
                    if (this.modelClass.name.startsWith("CrmImport") && ++updates === 2) {
                        throw new Error("The object must be of the same version.");
                    }
                    return await original.apply(this, args as any);
                });
                await runJob();
                expect((await repo.findOne(created.uid, { ignoreACL: true, skipCache: true })).processedRows).toBe(0);

                // A claim that loses the race claims nothing; one that fails otherwise is logged.
                vi.restoreAllMocks();
                const requeue = async () => {
                    const stored = await repo.findOne(created.uid, { ignoreACL: true, skipCache: true });
                    await repo.update({ uid: created.uid, version: stored.version, status: "queued" }, stored, { ignoreACL: true });
                };
                await requeue();
                vi.spyOn(CrmRepoUtils.prototype, "update").mockImplementation(async function (this: any, ...args: any[]) {
                    if (this.modelClass.name.startsWith("CrmImport")) {
                        throw new Error("The object must be of the same version.");
                    }
                    return await original.apply(this, args as any);
                });
                await runJob();
                expect((await repo.findOne(created.uid, { ignoreACL: true, skipCache: true })).status).toBe("queued");

                vi.restoreAllMocks();
                vi.spyOn(CrmRepoUtils.prototype, "update").mockImplementation(async function (this: any, ...args: any[]) {
                    if (this.modelClass.name.startsWith("CrmImport")) {
                        throw new Error("database down");
                    }
                    return await original.apply(this, args as any);
                });
                await runJob();
                expect((await repo.findOne(created.uid, { ignoreACL: true, skipCache: true })).status).toBe("queued");

                // A progress save that fails for any other reason fails the run too.
                vi.restoreAllMocks();
                updates = 0;
                vi.spyOn(CrmRepoUtils.prototype, "update").mockImplementation(async function (this: any, ...args: any[]) {
                    if (this.modelClass.name.startsWith("CrmImport") && ++updates === 2) {
                        throw new Error("database down");
                    }
                    return await original.apply(this, args as any);
                });
                await runJob();
                expect((await repo.findOne(created.uid, { ignoreACL: true, skipCache: true })).processedRows).toBe(0);
            });
        });
    });
}
