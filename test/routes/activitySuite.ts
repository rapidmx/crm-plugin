///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Custom property definitions, notes, tasks and the timeline - identical on both backends.
import { CrmTestContext, call, setUpWorkspace } from "./context.js";

export function activitySuite(ctx: CrmTestContext): void {
    describe("properties, notes, tasks and timeline", () => {
        let workspaceUid: string;
        let contactUid: string;

        beforeEach(async () => {
            workspaceUid = await setUpWorkspace(ctx);
            contactUid = (await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email: "a@x.example" })).body.uid;
        });

        describe("property definitions", () => {
            const path = (suffix: string = "") => `/properties/${workspaceUid}${suffix}`;

            it("lets admins define, change and delete properties, deleting every value with the property", async () => {
                const plan = await call(ctx, "post", path(), ctx.users.owner, {
                    objectType: "contact",
                    key: "plan",
                    label: "Plan",
                    type: "select",
                    options: [{ value: "free" }, "pro"],
                    group: "Billing",
                    description: "What they pay for",
                });
                expect(plan.status).toBe(200);
                expect(plan.body.options).toEqual([
                    { value: "free", label: "free" },
                    { value: "pro", label: "pro" },
                ]);
                await call(ctx, "post", path(), ctx.users.owner, { objectType: "company", key: "tier", label: "Tier", type: "number" });
                expect((await call(ctx, "put", `/contacts/${workspaceUid}/${contactUid}`, ctx.users.editor, { properties: { plan: "pro" } })).status).toBe(200);

                expect((await call(ctx, "get", `${path()}?objectType=company`, ctx.users.viewer)).body.map((definition: any) => definition.key)).toEqual(["tier"]);
                expect((await call(ctx, "get", path(), ctx.users.viewer)).body).toHaveLength(2);
                const changed = await call(ctx, "put", path(`/${plan.body.uid}`), ctx.users.owner, {
                    label: "Pricing plan",
                    options: [{ value: "free", label: "Free" }, { value: "pro", label: "Pro" }, "team"],
                    group: null,
                    key: "plan",
                });
                expect(changed.body).toMatchObject({ label: "Pricing plan", key: "plan" });
                expect(changed.body.options).toHaveLength(3);

                expect((await call(ctx, "post", path(), ctx.users.editor, { objectType: "contact", key: "x", label: "X", type: "text" })).status).toBe(403);
                expect((await call(ctx, "delete", path(`/${plan.body.uid}`), ctx.users.owner)).status).toBe(204);
                expect((await call(ctx, "get", `/contacts/${workspaceUid}/${contactUid}`, ctx.users.viewer)).body.properties).toEqual({});
                expect(await (await ctx.repo("propertyValue")).count({ key: "plan" }, { ignoreACL: true })).toBe(0);
            });

            it("refuses bad definitions and changes to a property's identity", async () => {
                for (const body of [
                    { objectType: "lead", key: "x", label: "X", type: "text" },
                    { objectType: "contact", key: "Bad Key", label: "X", type: "text" },
                    { objectType: "contact", key: "email", label: "X", type: "text" },
                    { objectType: "contact", key: "tags", label: "X", type: "text" },
                    { objectType: "contact", key: "x", label: "X", type: "color" },
                    { objectType: "contact", key: "x", type: "text" },
                    { objectType: "contact", key: "x", label: "X", type: "select" },
                    { objectType: "contact", key: "x", label: "X", type: "select", options: [] },
                    { objectType: "contact", key: "x", label: "X", type: "select", options: ["a", "a"] },
                    { objectType: "contact", key: "x", label: "X", type: "select", options: [{ value: "" }] },
                    { objectType: "contact", key: "x", label: "X", type: "select", options: "a" },
                    { objectType: "contact", key: "x", label: "X", type: "text", options: ["a"] },
                ]) {
                    expect((await call(ctx, "post", path(), ctx.users.owner, body)).status).toBe(400);
                }
                const seats = await call(ctx, "post", path(), ctx.users.owner, { objectType: "contact", key: "seats", label: "Seats", type: "number" });
                expect((await call(ctx, "post", path(), ctx.users.owner, { objectType: "contact", key: "seats", label: "Seats", type: "text" })).status).toBe(409);
                for (const body of [{ key: "other" }, { type: "text" }, { objectType: "company" }, { label: null }, { options: ["a"] }]) {
                    expect((await call(ctx, "put", path(`/${seats.body.uid}`), ctx.users.owner, body)).status).toBe(400);
                }
            });
        });

        describe("notes", () => {
            const path = (suffix: string = "") => `/notes/${workspaceUid}${suffix}`;

            it("writes notes on a contact, lists them by record, and keeps the timeline in step", async () => {
                const note = await call(ctx, "post", path(), ctx.users.editor, { subjectType: "contact", subjectUid: contactUid, body: "Called about renewal", pinned: true });
                expect(note.status).toBe(200);
                expect(note.body).toMatchObject({ authorUserUid: ctx.users.editor.uid, pinned: true, body: "Called about renewal" });
                const long = await call(ctx, "post", path(), ctx.users.editor, { subjectType: "contact", subjectUid: contactUid, body: "x".repeat(300) });

                expect((await call(ctx, "get", `${path()}?subjectUid=${contactUid}`, ctx.users.viewer)).body).toHaveLength(2);
                expect((await call(ctx, "get", `${path()}?subjectUid=someone-else`, ctx.users.viewer)).body).toEqual([]);
                const timeline = await call(ctx, "get", `/timeline/${workspaceUid}/contact/${contactUid}`, ctx.users.viewer);
                expect(timeline.body.filter((entry: any) => entry.kind === "note").map((entry: any) => entry.summary.length).sort((a: number, b: number) => a - b)).toEqual([20, 200]);

                expect((await call(ctx, "put", path(`/${note.body.uid}`), ctx.users.editor, { body: "Renewed!", pinned: false })).body).toMatchObject({ body: "Renewed!", pinned: false });
                expect((await call(ctx, "put", path(`/${note.body.uid}`), ctx.users.editor, { body: "" })).status).toBe(400);
                expect((await call(ctx, "put", path(`/${note.body.uid}`), ctx.users.editor, { subjectUid: "other" })).status).toBe(400);
                expect((await call(ctx, "delete", path(`/${long.body.uid}`), ctx.users.editor)).status).toBe(204);
                const after = await call(ctx, "get", `/timeline/${workspaceUid}/contact/${contactUid}`, ctx.users.viewer);
                expect(after.body.filter((entry: any) => entry.kind === "note")).toHaveLength(1);
            });

            it("refuses notes on nothing, and deletes a contact's notes with it", async () => {
                for (const body of [
                    { subjectType: "contact", subjectUid: "nobody", body: "x" },
                    { subjectType: "deal", subjectUid: contactUid, body: "x" },
                    { subjectType: "contact", subjectUid: contactUid },
                    { subjectType: "contact", subjectUid: contactUid, body: 5 },
                ]) {
                    expect((await call(ctx, "post", path(), ctx.users.editor, body)).status).toBe(400);
                }
                await call(ctx, "post", path(), ctx.users.editor, { subjectType: "contact", subjectUid: contactUid, body: "x" });
                await call(ctx, "delete", `/contacts/${workspaceUid}/${contactUid}`, ctx.users.editor);
                expect(await (await ctx.repo("note")).count({}, { ignoreACL: true })).toBe(0);
                expect((await call(ctx, "get", `/timeline/${workspaceUid}/contact/${contactUid}`, ctx.users.viewer)).status).toBe(400);
            });

            it("can't be searched with a filter", async () => {
                expect((await call(ctx, "post", path("/search"), ctx.users.viewer, { filter: {} })).status).toBe(400);
                expect((await call(ctx, "post", path("/search"), ctx.users.viewer, {})).body).toEqual({ items: [], total: 0 });
            });
        });

        describe("tasks", () => {
            const path = (suffix: string = "") => `/tasks/${workspaceUid}${suffix}`;

            it("assigns tasks to members, completes and reopens them, and records them on the record's timeline", async () => {
                const task = await call(ctx, "post", path(), ctx.users.editor, {
                    title: "Send the proposal",
                    notes: "Include pricing",
                    priority: "high",
                    dueAt: "2026-10-01T09:00:00.000Z",
                    subjectType: "contact",
                    subjectUid: contactUid,
                });
                expect(task.status).toBe(200);
                expect(task.body).toMatchObject({ assigneeUserUid: ctx.users.editor.uid, createdByUserUid: ctx.users.editor.uid, status: "open", priority: "high" });
                const mine = await call(ctx, "post", path(), ctx.users.editor, { title: "Plan", assigneeUserUid: ctx.users.viewer.uid, status: "done" });
                expect(mine.body.completedAt).toBeTruthy();

                const done = await call(ctx, "put", path(`/${task.body.uid}`), ctx.users.editor, { status: "done" });
                expect(done.body.completedAt).toBeTruthy();
                const reopened = await call(ctx, "put", path(`/${task.body.uid}`), ctx.users.editor, { status: "open", dueAt: null });
                expect(reopened.body.completedAt ?? undefined).toBeUndefined();
                expect(reopened.body.dueAt ?? undefined).toBeUndefined();
                const timeline = await call(ctx, "get", `/timeline/${workspaceUid}/contact/${contactUid}`, ctx.users.viewer);
                expect(timeline.body.map((entry: any) => entry.kind)).toEqual(["task_completed", "task_created", "created"]);

                expect((await call(ctx, "get", `${path()}?status=open`, ctx.users.viewer)).body.map((entry: any) => entry.title)).toEqual(["Send the proposal"]);
                expect((await call(ctx, "get", `${path()}?assigneeUserUid=${ctx.users.viewer.uid.toUpperCase()}`, ctx.users.viewer)).body).toHaveLength(1);
                expect((await call(ctx, "get", `${path()}?subjectUid=${contactUid}`, ctx.users.viewer)).body).toHaveLength(1);
                const sorted = await call(ctx, "post", path("/search"), ctx.users.viewer, { sort: { field: "title", direction: "asc" } });
                expect(sorted.body.items.map((entry: any) => entry.title)).toEqual(["Plan", "Send the proposal"]);

                // Unlinking the subject, then relinking it.
                const unlinked = await call(ctx, "put", path(`/${task.body.uid}`), ctx.users.editor, { subjectType: null });
                expect(unlinked.body.subjectUid ?? undefined).toBeUndefined();
                const relinked = await call(ctx, "put", path(`/${task.body.uid}`), ctx.users.editor, { subjectType: "contact", subjectUid: contactUid });
                expect(relinked.body.subjectUid).toBe(contactUid);
                // Deleting the contact keeps the task, unlinked.
                await call(ctx, "delete", `/contacts/${workspaceUid}/${contactUid}`, ctx.users.editor);
                expect((await call(ctx, "get", path(`/${task.body.uid}`), ctx.users.viewer)).body.subjectUid ?? undefined).toBeUndefined();
            });

            it("refuses bad tasks", async () => {
                for (const body of [
                    {},
                    { title: "x", priority: "urgent" },
                    { title: "x", status: "blocked" },
                    { title: "x", dueAt: "soon" },
                    { title: "x", assigneeUserUid: ctx.users.stranger.uid },
                    { title: "x", subjectType: "contact", subjectUid: "nobody" },
                ]) {
                    expect((await call(ctx, "post", path(), ctx.users.editor, body)).status).toBe(400);
                }
                const task = await call(ctx, "post", path(), ctx.users.editor, { title: "x" });
                expect((await call(ctx, "put", path(`/${task.body.uid}`), ctx.users.editor, { title: null })).status).toBe(400);
                expect((await call(ctx, "put", path(`/${task.body.uid}`), ctx.users.editor, { subjectUid: "nobody" })).status).toBe(400);
                expect((await call(ctx, "post", path(), ctx.users.viewer, { title: "x" })).status).toBe(403);
            });
        });

        describe("timeline", () => {
            it("pages newest first, and only for a real record of the workspace", async () => {
                for (const jobTitle of ["A", "B", "C"]) {
                    await call(ctx, "put", `/contacts/${workspaceUid}/${contactUid}`, ctx.users.editor, { jobTitle });
                }
                // An update that changes nothing adds nothing.
                await call(ctx, "put", `/contacts/${workspaceUid}/${contactUid}`, ctx.users.editor, { jobTitle: "C" });
                const first = await call(ctx, "get", `/timeline/${workspaceUid}/contact/${contactUid}?limit=2`, ctx.users.viewer);
                expect(first.body).toHaveLength(2);
                const rest = await call(ctx, "get", `/timeline/${workspaceUid}/contact/${contactUid}?limit=2&page=1`, ctx.users.viewer);
                expect(rest.body).toHaveLength(2);
                expect(rest.body[1].kind).toBe("created");
                expect((await call(ctx, "get", `/timeline/${workspaceUid}/company/${contactUid}`, ctx.users.viewer)).status).toBe(400);
                expect((await call(ctx, "get", `/timeline/${workspaceUid}/contact/${contactUid}`, ctx.users.stranger)).status).toBe(404);
            });
        });
    });
}
