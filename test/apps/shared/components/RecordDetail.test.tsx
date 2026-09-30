// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@rapidmx/web-client/lib/util/api.js";
import { MockAppShell, company, contact, member, mockCrmApi, property, stubBasics, workspace } from "../../fixtures.js";
import * as crmApi from "../../../../apps/shared/crmApi.js";
import CrmShell from "../../../../apps/shared/components/CrmShell.js";
import RecordDetail from "../../../../apps/shared/components/RecordDetail.js";

vi.mock("../../../../apps/shared/crmApi.js", (importOriginal) => mockCrmApi(importOriginal));
vi.mock("@rapidmx/web-client/shared/components/layout/AppShell.js", () => ({ default: MockAppShell }));

const api: any = crmApi;
const assign = vi.fn();

function renderDetail(objectType: "contact" | "company" = "contact", uid: string = "c1") {
    return render(
        <CrmShell section="contacts">
            <RecordDetail objectType={objectType} uid={uid} />
        </CrmShell>,
    );
}

const definitions = [
    property(),
    property({ uid: "p2", key: "seats", label: "Seats", type: "number", options: [] }),
    property({ uid: "p3", key: "since", label: "Since", type: "date", options: [] }),
    property({ uid: "p4", key: "beta", label: "Beta", type: "boolean", options: [] }),
    property({ uid: "p5", key: "interests", label: "Interests", type: "multi_select", options: [{ value: "mail", label: "Mail" }] }),
];

beforeEach(() => {
    stubBasics(api);
    window.localStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign, search: "" } });
    api.listProperties.mockResolvedValue(definitions);
    api.listMembers.mockResolvedValue([member(), member({ uid: "m2", userUid: "u2", displayName: undefined, address: undefined })]);
    api.getRecord.mockResolvedValue(
        contact({ ownerUserUid: "u1", properties: { plan: "pro", seats: 3, since: "2026-01-02T00:00:00.000Z", beta: true, interests: ["mail"] } }),
    );
    api.listTimeline.mockResolvedValue([{ uid: "t1", kind: "created", summary: "Created the contact", occurredAt: "2026-09-01T00:00:00.000Z" }]);
    api.listNotes.mockResolvedValue([{ uid: "n1", body: "Called them", subjectType: "contact", subjectUid: "c1" }]);
    api.listTasks.mockResolvedValue([
        { uid: "k1", title: "Send proposal", status: "open", dueAt: "2026-10-01T00:00:00.000Z" },
        { uid: "k2", title: "Intro call", status: "done" },
    ]);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("RecordDetail", () => {
    it("shows a contact's fields, properties, owner, notes, tasks and activity", async () => {
        renderDetail();

        expect(await screen.findByRole("heading", { name: "Ann Archer" })).toBeInTheDocument();
        expect(screen.getByLabelText("Email")).toHaveValue("ann@acme.example");
        expect(screen.getByLabelText("Plan")).toHaveValue("pro");
        expect(screen.getByLabelText("Seats")).toHaveValue(3);
        expect(screen.getByLabelText("Since")).toHaveValue("2026-01-02");
        expect(screen.getByLabelText("Beta")).toHaveValue("true");
        expect(screen.getByLabelText("Interests")).toHaveValue("mail");
        expect(screen.getByLabelText("Interests")).toHaveAttribute("placeholder", "mail");
        expect(screen.getByLabelText("Tags (comma-separated)")).toHaveValue("vip");
        expect(screen.getByLabelText("Owner")).toHaveValue("u1");
        expect(within(screen.getByLabelText("Owner")).getByRole("option", { name: "u2" })).toBeInTheDocument();
        expect(screen.getByText("Called them")).toBeInTheDocument();
        expect(screen.getByText("Created the contact")).toBeInTheDocument();
        expect(screen.getByText(/due/)).toBeInTheDocument();
        expect(screen.getByText("Intro call")).toHaveClass("line-through");
    });

    it("saves every field, property, tag and the owner, clearing emptied ones", async () => {
        api.updateRecord.mockRejectedValueOnce(new ApiRequestError("Stale", 409)).mockImplementation(async (_type: string, _ws: string, _uid: string, body: any) =>
            contact({ version: 1, firstName: body.firstName, tags: body.tags }),
        );
        renderDetail();
        await screen.findByRole("heading", { name: "Ann Archer" });

        await userEvent.clear(screen.getByLabelText("Last name"));
        await userEvent.clear(screen.getByLabelText("Seats"));
        await userEvent.type(screen.getByLabelText("Seats"), "7");
        await userEvent.clear(screen.getByLabelText("Tags (comma-separated)"));
        await userEvent.type(screen.getByLabelText("Tags (comma-separated)"), "a, b,,");
        await userEvent.selectOptions(screen.getByLabelText("Owner"), "");
        await userEvent.selectOptions(screen.getByLabelText("Beta"), "false");
        await userEvent.clear(screen.getByLabelText("Interests"));
        await userEvent.type(screen.getByLabelText("Interests"), "mail, crm");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Stale")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        const body = api.updateRecord.mock.lastCall[3];
        expect(body).toMatchObject({
            version: 0,
            email: "ann@acme.example",
            lastName: null,
            score: 10,
            tags: ["a", "b"],
            ownerUserUid: null,
            properties: { plan: "pro", seats: 7, since: "2026-01-02T00:00:00.000Z", beta: false, interests: ["mail", "crm"] },
        });
        expect(api.listTimeline).toHaveBeenCalledTimes(2);
    });

    it("adds and deletes notes, and adds, ticks and fails tasks", async () => {
        api.createNote.mockRejectedValueOnce(new Error("x")).mockResolvedValue({});
        api.deleteNote.mockResolvedValue(undefined);
        api.createTask.mockRejectedValueOnce(new Error("x")).mockResolvedValue({});
        api.updateTask.mockResolvedValue({});
        renderDetail();
        await screen.findByRole("heading", { name: "Ann Archer" });

        await userEvent.type(screen.getByLabelText("New note"), "Follow up Tuesday");
        await userEvent.click(screen.getByRole("button", { name: "Add note" }));
        expect(await screen.findByText("Could not add the note.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Add note" }));
        await waitFor(() => expect(screen.getByLabelText("New note")).toHaveValue(""));
        expect(api.createNote).toHaveBeenLastCalledWith("w1", { subjectType: "contact", subjectUid: "c1", body: "Follow up Tuesday" });
        await userEvent.click(screen.getByRole("button", { name: "Delete note" }));
        expect(api.deleteNote).toHaveBeenCalledWith("w1", "n1");

        await userEvent.type(screen.getByLabelText("New task"), "Call back");
        await userEvent.click(screen.getByRole("button", { name: "Add task" }));
        expect(await screen.findByText("Could not add the task.")).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText("Due date"), "2026-11-01");
        await userEvent.click(screen.getByRole("button", { name: "Add task" }));
        await waitFor(() => expect(api.createTask).toHaveBeenLastCalledWith("w1", expect.objectContaining({ title: "Call back", dueAt: "2026-11-01T00:00:00.000Z" })));
        await userEvent.click(screen.getByLabelText("Done: Send proposal"));
        expect(api.updateTask).toHaveBeenLastCalledWith("w1", "k1", { status: "done" });
        await userEvent.click(screen.getByLabelText("Done: Intro call"));
        expect(api.updateTask).toHaveBeenLastCalledWith("w1", "k2", { status: "open" });
    });

    it("deletes the record when confirmed, and goes back to the list", async () => {
        api.deleteRecord.mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
        vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
        renderDetail();
        await screen.findByRole("heading", { name: "Ann Archer" });

        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        expect(api.deleteRecord).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        expect(await screen.findByText("Could not delete it.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(assign).toHaveBeenCalledWith("/crm?w=w1"));
    });

    it("shows a company read-only to a viewer, and goes back to companies after a delete", async () => {
        api.getRecord.mockResolvedValue(company({ employeeCount: 12 }));
        api.listProperties.mockResolvedValue([]);
        api.listWorkspaces.mockResolvedValue([workspace({ role: "viewer" })]);
        const { unmount } = renderDetail("company", "co1");
        expect(await screen.findByRole("heading", { name: "Acme Inc" })).toBeInTheDocument();
        expect(screen.getByLabelText("Employees")).toBeDisabled();
        expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
        expect(screen.queryByLabelText("New note")).not.toBeInTheDocument();
        unmount();

        api.listWorkspaces.mockResolvedValue([workspace()]);
        api.deleteRecord.mockResolvedValue(undefined);
        vi.spyOn(window, "confirm").mockReturnValue(true);
        renderDetail("company", "co1");
        await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
        await waitFor(() => expect(assign).toHaveBeenCalledWith("/crm/companies?w=w1"));
    });

    it("says so when the record can't be loaded", async () => {
        api.getRecord.mockRejectedValue(new ApiRequestError("Not found", 404));
        renderDetail();
        expect(await screen.findByText("Not found")).toBeInTheDocument();
    });
});
