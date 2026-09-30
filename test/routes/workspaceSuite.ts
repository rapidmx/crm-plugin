///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Workspaces, members and senders - identical on both backends.
import { CrmTestContext, call, setUpWorkspace } from "./context.js";

export function workspaceSuite(ctx: CrmTestContext): void {
    describe("workspaces", () => {
        it("creates a workspace owned by its creator, and lists it with the caller's role", async () => {
            const created = await call(ctx, "post", "/workspaces", ctx.users.owner, {
                name: "  Acme  ",
                description: "Our customers",
                timezone: "Europe/Paris",
                postalAddress: "1 Main St",
                website: "https://acme.example",
            });

            expect(created.status).toBe(200);
            expect(created.body).toMatchObject({
                name: "Acme",
                description: "Our customers",
                timezone: "Europe/Paris",
                postalAddress: "1 Main St",
                role: "owner",
                createdByUserUid: ctx.users.owner.uid,
            });
            const listed = await call(ctx, "get", "/workspaces", ctx.users.owner);
            expect(listed.body.map((workspace: any) => [workspace.uid, workspace.role])).toEqual([[created.body.uid, "owner"]]);
            expect((await call(ctx, "get", "/workspaces", ctx.users.stranger)).body).toEqual([]);
        });

        it("refuses a create without a name, with a bad time zone, anonymously, and past the per-user limit", async () => {
            expect((await call(ctx, "post", "/workspaces", ctx.users.owner, { name: " " })).status).toBe(400);
            expect((await call(ctx, "post", "/workspaces", ctx.users.owner, { name: "x", timezone: "Mars/Olympus" })).status).toBe(400);
            expect((await call(ctx, "post", "/workspaces", ctx.users.owner, [])).status).toBe(400);
            expect((await call(ctx, "post", "/workspaces", null, { name: "x" })).status).toBe(401);
            expect((await call(ctx, "get", "/workspaces", null)).status).toBe(401);
            for (let i = 0; i < 3; i++) {
                expect((await call(ctx, "post", "/workspaces", ctx.users.owner, { name: `W${i}` })).status).toBe(200);
            }
            const over = await call(ctx, "post", "/workspaces", ctx.users.owner, { name: "One too many" });
            expect(over.status).toBe(400);
            expect(over.body.message).toContain("at most 3");
        });

        it("lets members read it and only admins change it; strangers and administrators without membership get a 404", async () => {
            const workspaceUid: string = await setUpWorkspace(ctx);

            expect((await call(ctx, "get", `/workspaces/${workspaceUid}`, ctx.users.viewer)).body.role).toBe("viewer");
            expect((await call(ctx, "get", `/workspaces/${workspaceUid}`, ctx.users.stranger)).status).toBe(404);
            expect((await call(ctx, "get", `/workspaces/${workspaceUid}`, ctx.users.admin)).status).toBe(404);
            expect((await call(ctx, "get", `/workspaces/not-a-workspace`, ctx.users.owner)).status).toBe(404);
            expect((await call(ctx, "put", `/workspaces/${workspaceUid}`, ctx.users.editor, { name: "Nope" })).status).toBe(403);
            expect((await call(ctx, "put", `/workspaces/${workspaceUid}`, ctx.users.stranger, { name: "Nope" })).status).toBe(404);

            const updated = await call(ctx, "put", `/workspaces/${workspaceUid}`, ctx.users.owner, { name: "Renamed", description: null });
            expect(updated.status).toBe(200);
            expect(updated.body).toMatchObject({ name: "Renamed", role: "owner" });
            expect(updated.body.description ?? undefined).toBeUndefined();
            expect((await call(ctx, "put", `/workspaces/${workspaceUid}`, ctx.users.owner, { name: null })).status).toBe(400);
            expect(ctx.pushed().some((message) => message.uids.includes(workspaceUid) && message.type === "Workspace")).toBe(true);
        });

        it("deletes a workspace and everything in it - owners only", async () => {
            const workspaceUid: string = await setUpWorkspace(ctx);
            const contact = await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email: "a@x.example", tags: ["vip"] });
            expect(contact.status).toBe(200);

            expect((await call(ctx, "delete", `/workspaces/${workspaceUid}`, ctx.users.editor)).status).toBe(403);
            expect((await call(ctx, "delete", `/workspaces/${workspaceUid}`, ctx.users.owner)).status).toBe(204);

            expect((await call(ctx, "get", `/workspaces/${workspaceUid}`, ctx.users.owner)).status).toBe(404);
            expect(await (await ctx.repo("contact")).count({}, { ignoreACL: true })).toBe(0);
            expect(await (await ctx.repo("propertyValue")).count({}, { ignoreACL: true })).toBe(0);
            expect(await (await ctx.repo("workspaceMember")).count({}, { ignoreACL: true })).toBe(0);
        });
    });

    describe("workspace members", () => {
        it("adds a member by user uid or by mailbox address, and refuses duplicates and unknown addresses", async () => {
            const workspaceUid: string = await setUpWorkspace(ctx);
            await ctx.createMailbox(ctx.users.stranger.uid, "stranger@example.com");

            const byAddress = await call(ctx, "post", `/workspaces/${workspaceUid}/members`, ctx.users.owner, { address: "Stranger@Example.com", role: "editor" });
            expect(byAddress.status).toBe(200);
            expect(byAddress.body).toMatchObject({ userUid: ctx.users.stranger.uid, role: "editor", address: "stranger@example.com" });
            expect((await call(ctx, "get", `/workspaces/${workspaceUid}`, ctx.users.stranger)).body.role).toBe("editor");

            expect((await call(ctx, "post", `/workspaces/${workspaceUid}/members`, ctx.users.owner, { userUid: ctx.users.stranger.uid, role: "viewer" })).status).toBe(409);
            expect((await call(ctx, "post", `/workspaces/${workspaceUid}/members`, ctx.users.owner, { address: "nobody@example.com", role: "viewer" })).status).toBe(400);
            expect((await call(ctx, "post", `/workspaces/${workspaceUid}/members`, ctx.users.owner, { role: "viewer" })).status).toBe(400);
            expect((await call(ctx, "post", `/workspaces/${workspaceUid}/members`, ctx.users.owner, { userUid: "x", role: "boss" })).status).toBe(400);
            const members = await call(ctx, "get", `/workspaces/${workspaceUid}/members`, ctx.users.viewer);
            expect(members.body.map((member: any) => member.role)).toEqual(["owner", "editor", "viewer", "editor"]);
        });

        it("lets admins manage members, but only owners grant or change ownership", async () => {
            const workspaceUid: string = await setUpWorkspace(ctx);
            const path = `/workspaces/${workspaceUid}/members`;

            expect((await call(ctx, "post", path, ctx.users.editor, { userUid: ctx.users.stranger.uid, role: "viewer" })).status).toBe(403);
            expect((await call(ctx, "put", `${path}/${ctx.users.editor.uid}`, ctx.users.owner, { role: "admin" })).status).toBe(200);
            // The editor is an admin now: they may add viewers, but not owners.
            expect((await call(ctx, "post", path, ctx.users.editor, { userUid: ctx.users.stranger.uid, role: "owner" })).status).toBe(403);
            expect((await call(ctx, "post", path, ctx.users.editor, { userUid: ctx.users.stranger.uid, role: "viewer" })).status).toBe(200);
            expect((await call(ctx, "put", `${path}/${ctx.users.owner.uid}`, ctx.users.editor, { role: "viewer" })).status).toBe(403);
            expect((await call(ctx, "put", `${path}/${ctx.users.viewer.uid}`, ctx.users.editor, { role: "owner" })).status).toBe(403);
            expect((await call(ctx, "put", `${path}/not-a-member`, ctx.users.editor, { role: "viewer" })).status).toBe(404);
            // An admin can change the workspace itself.
            expect((await call(ctx, "put", `/workspaces/${workspaceUid}`, ctx.users.editor, { website: "https://x.example" })).status).toBe(200);
        });

        it("keeps at least one owner, and applies role changes and removals to access at once", async () => {
            const workspaceUid: string = await setUpWorkspace(ctx);
            const path = `/workspaces/${workspaceUid}/members`;

            expect((await call(ctx, "put", `${path}/${ctx.users.owner.uid}`, ctx.users.owner, { role: "admin" })).status).toBe(409);
            expect((await call(ctx, "delete", `${path}/${ctx.users.owner.uid}`, ctx.users.owner)).status).toBe(409);
            expect((await call(ctx, "put", `${path}/${ctx.users.viewer.uid}`, ctx.users.owner, { role: "owner" })).status).toBe(200);
            // Two owners: the first can now step down.
            expect((await call(ctx, "put", `${path}/${ctx.users.owner.uid}`, ctx.users.owner, { role: "editor" })).status).toBe(200);
            expect((await call(ctx, "put", `/workspaces/${workspaceUid}`, ctx.users.owner, { name: "x" })).status).toBe(403);

            // A member may leave; removing someone else takes MANAGE.
            expect((await call(ctx, "delete", `${path}/${ctx.users.editor.uid}`, ctx.users.owner)).status).toBe(403);
            expect((await call(ctx, "delete", `${path}/${ctx.users.editor.uid}`, ctx.users.editor)).status).toBe(204);
            expect((await call(ctx, "get", `/workspaces/${workspaceUid}`, ctx.users.editor)).status).toBe(404);
            expect((await call(ctx, "delete", `${path}/${ctx.users.owner.uid}`, ctx.users.viewer)).status).toBe(204);
            expect((await call(ctx, "get", `/workspaces/${workspaceUid}`, ctx.users.owner)).status).toBe(404);
            expect((await call(ctx, "delete", `${path}/${ctx.users.owner.uid}`, ctx.users.viewer)).status).toBe(404);
        });
    });

    describe("workspace senders", () => {
        it("names members after their own mailbox: the creator, those added by uid, and those added before", async () => {
            await ctx.createMailbox(ctx.users.owner.uid, "olive@acme.example");
            await ctx.createMailbox(ctx.users.owner.uid, "olive-2@acme.example");
            await ctx.createMailbox(ctx.users.editor.uid, "eddie@acme.example");
            const workspaceUid: string = (await call(ctx, "post", "/workspaces", ctx.users.owner, { name: "Named" })).body.uid;
            await call(ctx, "post", `/workspaces/${workspaceUid}/members`, ctx.users.owner, { userUid: ctx.users.editor.uid, role: "editor" });
            await call(ctx, "post", `/workspaces/${workspaceUid}/members`, ctx.users.owner, { userUid: ctx.users.viewer.uid, role: "viewer" });
            // A member stored without a name (as members were before) is described when listed.
            const repo = await ctx.repo("workspaceMember");
            const row = (await repo.find({ workspaceUid, userUid: ctx.users.editor.uid }, { ignoreACL: true, limit: 1 }))[0];
            await repo.update({ uid: row.uid, version: row.version, address: null, displayName: null }, row, { ignoreACL: true });

            const members = (await call(ctx, "get", `/workspaces/${workspaceUid}/members`, ctx.users.viewer)).body;
            expect(members.map((member: any) => [member.role, member.address ?? null, member.displayName ?? null])).toEqual([
                ["owner", "olive@acme.example", "Mailbox of olive@acme.example"],
                ["editor", "eddie@acme.example", "Mailbox of eddie@acme.example"],
                ["viewer", null, null],
            ]);
            expect((await repo.find({ workspaceUid, userUid: ctx.users.editor.uid }, { ignoreACL: true, limit: 1 }))[0].address ?? null).toBeNull();
        });

        it("tells an admin which of their mailboxes they can send from", async () => {
            const workspaceUid: string = await setUpWorkspace(ctx);
            const path = `/workspaces/${workspaceUid}/sendable-mailboxes`;
            await ctx.createMailbox(ctx.users.owner.uid, "sales@acme.example");
            await ctx.createMailbox(ctx.users.stranger.uid, "ceo@acme.example");
            await ctx.createMailbox(ctx.users.stranger.uid, "shared@acme.example", [{ userOrRoleId: ctx.users.owner.uid, actions: ["READ"] }]);
            const answer = await call(ctx, "post", path, ctx.users.owner, { mailboxUids: ["sales@acme.example", "sales@acme.example", "ceo@acme.example", "shared@acme.example", "gone"] });
            expect(answer.body).toEqual([{ uid: "sales@acme.example", address: "sales@acme.example", displayName: "Mailbox of sales@acme.example" }]);
            for (const body of [{}, { mailboxUids: "x" }, { mailboxUids: [5] }, { mailboxUids: [""] }, { mailboxUids: Array.from({ length: 201 }, (_value, index) => `m${index}`) }]) {
                expect((await call(ctx, "post", path, ctx.users.owner, body)).status).toBe(400);
            }
            expect((await call(ctx, "post", path, ctx.users.editor, { mailboxUids: [] })).status).toBe(403);
            expect((await call(ctx, "post", path, ctx.users.owner, { mailboxUids: [] })).body).toEqual([]);
        });

        it("adds a sender for a mailbox the caller can send from, and refuses anyone else's", async () => {
            const workspaceUid: string = await setUpWorkspace(ctx);
            const path = `/workspaces/${workspaceUid}/senders`;
            await ctx.createMailbox(ctx.users.owner.uid, "sales@acme.example");
            await ctx.createMailbox(ctx.users.stranger.uid, "ceo@acme.example");

            const added = await call(ctx, "post", path, ctx.users.owner, { fromAddress: "Sales@Acme.example", fromName: "Acme Sales" });
            expect(added.status).toBe(200);
            expect(added.body).toMatchObject({ mailboxUid: "sales@acme.example", fromAddress: "sales@acme.example", fromName: "Acme Sales" });
            expect((await call(ctx, "post", path, ctx.users.owner, { fromAddress: "sales@acme.example" })).status).toBe(409);
            expect((await call(ctx, "post", path, ctx.users.owner, { fromAddress: "ceo@acme.example" })).status).toBe(400);
            expect((await call(ctx, "post", path, ctx.users.owner, { fromAddress: "nobody@acme.example" })).status).toBe(400);
            expect((await call(ctx, "post", path, ctx.users.owner, { fromAddress: "not an address" })).status).toBe(400);
            expect((await call(ctx, "post", path, ctx.users.editor, { fromAddress: "sales@acme.example" })).status).toBe(403);
            // A trusted administrator has no implicit send access to anyone's mailbox.
            await call(ctx, "post", `/workspaces/${workspaceUid}/members`, ctx.users.owner, { userUid: ctx.users.admin.uid, role: "admin" });
            expect((await call(ctx, "post", path, ctx.users.admin, { fromAddress: "ceo@acme.example" })).status).toBe(400);

            const updated = await call(ctx, "put", `${path}/${added.body.uid}`, ctx.users.owner, { fromName: "Sales team", replyToAddress: "help@acme.example" });
            expect(updated.body).toMatchObject({ fromName: "Sales team", replyToAddress: "help@acme.example" });
            expect((await call(ctx, "get", path, ctx.users.viewer)).body).toHaveLength(1);
            expect((await call(ctx, "delete", `${path}/${added.body.uid}`, ctx.users.owner)).status).toBe(204);
            expect((await call(ctx, "delete", `${path}/${added.body.uid}`, ctx.users.owner)).status).toBe(404);
            expect((await call(ctx, "get", path, ctx.users.viewer)).body).toEqual([]);
        });
    });
}
