// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// The tasks, import and settings pages.
import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@rapidmx/web-client/lib/util/api.js";
import { MockAppShell, member, mockCrmApi, property, stubBasics, workspace } from "../../fixtures.js";
import * as crmApi from "../../../../apps/shared/crmApi.js";
import CrmShell, { WORKSPACE_STORAGE_KEY } from "../../../../apps/shared/components/CrmShell.js";
import TaskList from "../../../../apps/shared/components/TaskList.js";
import ImportWizard, { IMPORT_POLL_MS } from "../../../../apps/shared/components/ImportWizard.js";
import WorkspaceSettings, { chipAddress, suggestPeople } from "../../../../apps/shared/components/WorkspaceSettings.js";

vi.mock("../../../../apps/shared/crmApi.js", (importOriginal) => mockCrmApi(importOriginal));
vi.mock("@rapidmx/web-client/shared/components/layout/AppShell.js", () => ({ default: MockAppShell }));
const web = vi.hoisted(() => ({ listMailboxes: vi.fn(), searchDirectory: vi.fn() }));
vi.mock("@rapidmx/web-client/lib/mail/mailApi.js", async (importOriginal) => ({ ...((await importOriginal()) as any), listMailboxes: web.listMailboxes }));
vi.mock("@rapidmx/web-client/lib/mail/directoryApi.js", async (importOriginal) => ({ ...((await importOriginal()) as any), searchDirectory: web.searchDirectory }));

const api: any = crmApi;
const assign = vi.fn();

function inShell(ui: React.ReactElement) {
    return render(<CrmShell section="settings">{ui}</CrmShell>);
}

beforeEach(() => {
    stubBasics(api);
    web.listMailboxes.mockResolvedValue([]);
    web.searchDirectory.mockResolvedValue([]);
    api.sendableMailboxes.mockResolvedValue([]);
    window.localStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign, search: "" } });
});

afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
});

describe("TaskList", () => {
    const task = (overrides: Record<string, unknown> = {}) => ({ uid: "k1", title: "Send proposal", status: "open", priority: "high", assigneeUserUid: "u1", ...overrides });

    it("filters by status and assignee, and adds, completes and deletes tasks", async () => {
        api.listMembers.mockResolvedValue([member(), member({ uid: "m2", userUid: "u2", displayName: undefined, address: "two@x.example" })]);
        api.listTasks.mockResolvedValue([
            task({ subjectType: "contact", subjectUid: "c1", dueAt: "2026-10-01T00:00:00.000Z" }),
            task({ uid: "k2", title: "Review", priority: "normal", subjectType: "company", subjectUid: "co1", assigneeUserUid: "nobody" }),
        ]);
        api.createTask.mockRejectedValueOnce(new Error("x")).mockResolvedValue({});
        api.updateTask.mockResolvedValue({});
        api.deleteTask.mockResolvedValue(undefined);
        inShell(<TaskList />);

        expect(await screen.findByText("Send proposal")).toBeInTheDocument();
        expect(screen.getByText("High", { selector: "span" })).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: /Open/ }).map((link) => link.getAttribute("href"))).toEqual(["/crm/contacts/c1?w=w1", "/crm/companies/co1?w=w1"]);
        expect(screen.getByText("nobody")).toBeInTheDocument();
        expect(within(screen.getByLabelText("Assignee")).getByRole("option", { name: "two@x.example" })).toBeInTheDocument();

        await userEvent.selectOptions(screen.getByLabelText("Status"), "done");
        await userEvent.selectOptions(screen.getByLabelText("Assignee"), "u2");
        await waitFor(() => expect(api.listTasks).toHaveBeenLastCalledWith("w1", { status: "done", assigneeUserUid: "u2" }));

        await userEvent.type(screen.getByLabelText("Title"), "Call");
        await userEvent.selectOptions(screen.getByLabelText("Priority"), "low");
        await userEvent.click(screen.getByRole("button", { name: "Add task" }));
        expect(await screen.findByText("Could not add the task.")).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText("Due"), "2026-12-01");
        await userEvent.click(screen.getByRole("button", { name: "Add task" }));
        expect(api.createTask).toHaveBeenLastCalledWith("w1", { title: "Call", priority: "low", dueAt: "2026-12-01T00:00:00.000Z", assigneeUserUid: "u2" });

        await userEvent.click(screen.getByLabelText("Done: Send proposal"));
        expect(api.updateTask).toHaveBeenCalledWith("w1", "k1", { status: "done" });
        await userEvent.click(screen.getByRole("button", { name: "Delete Review" }));
        expect(api.deleteTask).toHaveBeenCalledWith("w1", "k2");
    });

    it("shows an empty list, a load failure, and nothing writable to viewers", async () => {
        api.listWorkspaces.mockResolvedValue([workspace({ role: "viewer" })]);
        api.listMembers.mockRejectedValue(new Error("x"));
        api.listTasks.mockResolvedValueOnce([]).mockResolvedValueOnce([task({ status: "done" })]).mockRejectedValue(new Error("x"));
        inShell(<TaskList />);
        expect(await screen.findByText("No open tasks.")).toBeInTheDocument();
        expect(screen.queryByRole("form", { name: "New task" })).not.toBeInTheDocument();
        await userEvent.selectOptions(screen.getByLabelText("Status"), "done");
        expect(await screen.findByLabelText("Done: Send proposal")).toBeDisabled();
        expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
        await userEvent.selectOptions(screen.getByLabelText("Status"), "open");
        expect(await screen.findByText("Could not load the tasks.")).toBeInTheDocument();
    });
});

describe("ImportWizard", () => {
    const upload = {
        import: {
            uid: "i1",
            fileName: "people.csv",
            totalRows: 2,
            mapping: [
                { column: "Email", target: "email" },
                { column: "Plan", target: undefined },
            ],
        },
        targets: ["email", "company", "properties.plan"],
        preview: [["a@x.example", "pro"]],
    };

    it("uploads a file, lets the mapping be changed, and starts the import", async () => {
        api.uploadImport.mockRejectedValueOnce(new ApiRequestError("The file needs a header row.", 400)).mockResolvedValue(upload);
        api.startImport.mockRejectedValueOnce(new Error("x")).mockResolvedValue({});
        inShell(<ImportWizard />);

        expect(await screen.findByText("No imports yet.")).toBeInTheDocument();
        const file = new File(["Email,Plan\na@x.example,pro"], "people.csv", { type: "text/csv" });
        await userEvent.selectOptions(screen.getByLabelText("The file holds"), "company");
        await userEvent.selectOptions(screen.getByLabelText("The file holds"), "contact");
        await userEvent.upload(screen.getByLabelText("CSV file"), file);
        await userEvent.click(screen.getByRole("button", { name: "Upload" }));
        expect(await screen.findByText("The file needs a header row.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Upload" }));

        expect(await screen.findByText("people.csv: 2 rows. Choose where each column goes.")).toBeInTheDocument();
        expect(api.uploadImport).toHaveBeenLastCalledWith("w1", "contact", file);
        expect(within(screen.getByLabelText("Import Plan as")).getByRole("option", { name: "plan (custom)" })).toBeInTheDocument();
        expect(within(screen.getByLabelText("Import Plan as")).getByRole("option", { name: "company name" })).toBeInTheDocument();
        await userEvent.selectOptions(screen.getByLabelText("Import Plan as"), "properties.plan");
        await userEvent.selectOptions(screen.getByLabelText("Import Email as"), "");
        await userEvent.selectOptions(screen.getByLabelText("Import Email as"), "email");
        await userEvent.click(screen.getByLabelText("Update records that are already here"));
        await userEvent.type(screen.getByLabelText("Tag everything imported with (comma-separated)"), "spring, ,list");
        await userEvent.click(screen.getByRole("button", { name: "Start import" }));
        expect(await screen.findByText("Could not start the import.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Start import" }));

        await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument());
        expect(api.startImport).toHaveBeenLastCalledWith("w1", "i1", {
            mapping: [
                { column: "Email", target: "email" },
                { column: "Plan", target: "properties.plan" },
            ],
            updateExisting: false,
            tags: ["spring", "list"],
        });
    });

    it("cancels a mapping", async () => {
        api.uploadImport.mockResolvedValue(upload);
        inShell(<ImportWizard />);
        await userEvent.upload(await screen.findByLabelText("CSV file"), new File(["x"], "x.csv"));
        await userEvent.click(screen.getByRole("button", { name: "Upload" }));
        await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
        expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
    });

    it("lists imports with their progress and skipped rows, refreshes running ones, and removes finished ones", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const running = { uid: "i1", fileName: "a.csv", objectType: "contact", status: "running", processedRows: 1, totalRows: 2, createdCount: 1, updatedCount: 0, skippedCount: 0, errors: [] };
        const done = { ...running, status: "done", processedRows: 2, skippedCount: 1, errors: [{ row: 3, message: "'email' must be an email address." }] };
        const companies = { ...done, uid: "i2", fileName: "b.csv", objectType: "company", errors: [] };
        api.listImports.mockResolvedValueOnce([running, companies]).mockResolvedValue([done, companies]);
        api.deleteImport.mockResolvedValue(undefined);
        const { unmount } = inShell(<ImportWizard />);

        expect(await screen.findByText("1 of 2 rows: 1 created, 0 updated, 0 skipped")).toBeInTheDocument();
        expect(screen.getByText("b.csv · companies")).toBeInTheDocument();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(IMPORT_POLL_MS);
        });
        expect(await screen.findByText("Row 3: 'email' must be an email address.")).toBeInTheDocument();
        await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
        expect(api.deleteImport).toHaveBeenCalledWith("w1", "i1");
        unmount();

        api.listImports.mockRejectedValue(new Error("x"));
        inShell(<ImportWizard />);
        expect(await screen.findByText("Could not load the imports.")).toBeInTheDocument();
    });
});

describe("WorkspaceSettings", () => {
    it("saves the workspace's details", async () => {
        api.listWorkspaces.mockResolvedValue([workspace({ description: "Sales team", postalAddress: "1 Main St", website: "https://acme.example" })]);
        api.updateWorkspace.mockRejectedValueOnce(new ApiRequestError("'timezone' must be an IANA time zone.", 400)).mockResolvedValue({});
        inShell(<WorkspaceSettings />);

        const name = await screen.findByLabelText("Name");
        expect(screen.getByLabelText("Description")).toHaveValue("Sales team");
        await userEvent.clear(name);
        await userEvent.type(name, "Acme EU");
        await userEvent.click(screen.getByRole("combobox", { name: "Time zone" }));
        await userEvent.type(screen.getByRole("searchbox", { name: "Search time zones" }), "tokyo");
        await userEvent.click(screen.getByRole("option", { name: /Tokyo/ }));
        expect(screen.getByRole("combobox", { name: "Time zone" })).toHaveTextContent(/Tokyo/);
        await userEvent.click(within(screen.getByRole("form", { name: "Workspace details" })).getByRole("button", { name: "Save" }));
        expect(await screen.findByText("'timezone' must be an IANA time zone.")).toBeInTheDocument();
        await userEvent.click(within(screen.getByRole("form", { name: "Workspace details" })).getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        expect(api.updateWorkspace).toHaveBeenLastCalledWith("w1", {
            name: "Acme EU",
            description: "Sales team",
            timezone: "Asia/Tokyo",
            postalAddress: "1 Main St",
            website: "https://acme.example",
        });
    });

    it("adds members found by name or address, changes their roles and removes them", async () => {
        api.listMembers.mockResolvedValue([
            member({ displayName: "Olive Owner", address: "olive@acme.example" }),
            member({ uid: "m2", userUid: "u2", role: "editor", displayName: undefined, address: "two@x.example" }),
            member({ uid: "m3", userUid: "u3", role: "viewer", displayName: undefined, address: undefined }),
        ]);
        web.searchDirectory.mockResolvedValue([
            { displayName: "Arthur Dent", address: "arthur@acme.example", kind: "user" },
            { displayName: "Support", address: "support@acme.example", kind: "shared" },
            { displayName: "Everyone", address: "all@acme.example", kind: "list" },
        ]);
        api.addMember.mockImplementation(async (_w: string, input: any) => {
            if (input.address === "nobody@x.example") {
                throw new ApiRequestError("Nobody on this server has the address nobody@x.example.", 400);
            }
            return {};
        });
        api.updateMember.mockResolvedValue({});
        api.removeMember.mockResolvedValue(undefined);
        inShell(<WorkspaceSettings />);

        // A member shows their name and address; one known only by uid shows the uid.
        const members = within(await screen.findByRole("region", { name: "Members" }));
        expect(await members.findByText("olive@acme.example")).toBeInTheDocument();
        expect(members.getByText("Olive Owner")).toBeInTheDocument();
        expect(members.getByText("u3")).toBeInTheDocument();
        api.updateMember.mockRejectedValueOnce(new Error("x"));
        await userEvent.selectOptions(screen.getByLabelText("Role of two@x.example"), "viewer");
        expect(await screen.findByText("Could not change the role.")).toBeInTheDocument();
        await userEvent.selectOptions(screen.getByLabelText("Role of two@x.example"), "admin");
        expect(api.updateMember).toHaveBeenCalledWith("w1", "u2", "admin");
        await waitFor(() => expect(screen.queryByText("Could not change the role.")).toBeNull());
        await userEvent.click(members.getAllByRole("button", { name: "Remove" })[1]);
        expect(api.removeMember).toHaveBeenCalledWith("w1", "u2");

        // Searching offers only people with an account; a pick and a typed address are both added.
        expect(screen.getByRole("button", { name: "Add member" })).toBeDisabled();
        await userEvent.type(screen.getByLabelText("People to add"), "arth");
        const suggestion = await screen.findByRole("option", { name: /Arthur Dent/ });
        expect(screen.queryByRole("option", { name: /Support/ })).toBeNull();
        expect(screen.queryByRole("option", { name: /Everyone/ })).toBeNull();
        await userEvent.click(suggestion);
        await userEvent.type(screen.getByLabelText("People to add"), "nobody@x.example");
        await userEvent.selectOptions(screen.getByLabelText("New member role"), "viewer");
        await userEvent.click(screen.getByRole("button", { name: "Add 2 members" }));
        expect(await screen.findByText(/nobody@x\.example: Nobody on this server has the address nobody@x\.example\./)).toBeInTheDocument();
        expect(api.addMember).toHaveBeenCalledWith("w1", { address: "arthur@acme.example", role: "viewer" });
        expect(api.addMember).toHaveBeenCalledWith("w1", { address: "nobody@x.example", role: "viewer" });
        // What failed stays in the field; once it's gone, nothing is left to add.
        expect(screen.getByRole("button", { name: "Add member" })).toBeEnabled();
        await userEvent.click(screen.getByRole("button", { name: /Remove nobody@x\.example/ }));
        await waitFor(() => expect(screen.getByRole("button", { name: "Add member" })).toBeDisabled());

        api.listMembers.mockRejectedValueOnce(new Error("x"));
        await userEvent.type(screen.getByLabelText("People to add"), "arthur@acme.example");
        await userEvent.click(screen.getByRole("button", { name: "Add member" }));
        expect(await screen.findByText("Could not load the members.")).toBeInTheDocument();
        expect(screen.queryByText(/Nobody on this server/)).toBeNull();
        expect(api.addMember).toHaveBeenLastCalledWith("w1", { address: "arthur@acme.example", role: "viewer" });
    });

    it("reads the address out of a people entry, and suggests only people", async () => {
        expect(chipAddress("Arthur Dent <Arthur@Acme.example>")).toBe("arthur@acme.example");
        expect(chipAddress(" x@y.example ")).toBe("x@y.example");
        web.searchDirectory.mockResolvedValue([
            { displayName: "A", address: "a@x.example", kind: "user" },
            { displayName: "R", address: "r@x.example", kind: "room" },
        ]);
        expect(await suggestPeople("a", { limit: 5 })).toEqual([{ displayName: "A", address: "a@x.example", kind: "user" }]);
        expect(web.searchDirectory).toHaveBeenCalledWith("a", { limit: 5 });
    });

    it("adds and removes senders and custom properties", async () => {
        api.listSenders.mockResolvedValue([{ uid: "s1", fromName: "Acme Sales", fromAddress: "sales@acme.example" }]);
        api.listProperties.mockResolvedValue([property()]);
        web.listMailboxes.mockResolvedValue([{ uid: "mb1" }, { uid: "mb2" }, { uid: "mb3" }]);
        api.sendableMailboxes.mockResolvedValue([
            { uid: "mb1", address: "sales@acme.example", displayName: "Acme Sales" },
            { uid: "mb2", address: "help@acme.example", displayName: "Help Desk" },
            { uid: "mb3", address: "noname@acme.example", displayName: "" },
        ]);
        api.addSender.mockRejectedValueOnce(new Error("x")).mockResolvedValue({});
        api.removeSender.mockResolvedValue(undefined);
        api.createProperty.mockRejectedValueOnce(new Error("x")).mockResolvedValue({});
        api.deleteProperty.mockResolvedValue(undefined);
        vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
        inShell(<WorkspaceSettings />);

        expect(await screen.findByText("Acme Sales <sales@acme.example>")).toBeInTheDocument();
        // The picker offers the mailboxes the caller can send from, less those already added.
        const mailbox = await screen.findByLabelText("Mailbox");
        expect(web.listMailboxes).toHaveBeenCalledWith({ limit: 200 });
        expect(api.sendableMailboxes).toHaveBeenCalledWith("w1", ["mb1", "mb2", "mb3"]);
        expect(within(mailbox).getAllByRole("option").map((option) => option.textContent)).toEqual(["Choose a mailbox…", "Help Desk <help@acme.example>", "noname@acme.example"]);
        expect(screen.getByRole("button", { name: "Add sender" })).toBeDisabled();
        await userEvent.selectOptions(mailbox, "mb2");
        expect(screen.getByLabelText("Sender name")).toHaveValue("Help Desk");
        await userEvent.click(screen.getByRole("button", { name: "Add sender" }));
        expect(await screen.findByText("Could not add the sender.")).toBeInTheDocument();
        expect(api.addSender).toHaveBeenLastCalledWith("w1", { fromAddress: "help@acme.example", fromName: "Help Desk" });
        await userEvent.clear(screen.getByLabelText("Sender name"));
        await userEvent.type(screen.getByLabelText("Sender name"), "Help");
        await userEvent.click(screen.getByRole("button", { name: "Add sender" }));
        expect(api.addSender).toHaveBeenLastCalledWith("w1", { fromAddress: "help@acme.example", fromName: "Help" });
        await waitFor(() => expect(screen.getByLabelText("Mailbox")).toHaveValue(""));
        await userEvent.selectOptions(screen.getByLabelText("Mailbox"), "mb3");
        expect(screen.getByLabelText("Sender name")).toHaveValue("");
        await userEvent.click(screen.getByRole("button", { name: "Add sender" }));
        expect(api.addSender).toHaveBeenLastCalledWith("w1", { fromAddress: "noname@acme.example" });
        await userEvent.click(within(screen.getByRole("region", { name: "Senders" })).getByRole("button", { name: "Remove" }));
        expect(api.removeSender).toHaveBeenCalledWith("w1", "s1");

        await userEvent.selectOptions(screen.getByLabelText("Property of"), "company");
        await userEvent.type(screen.getByLabelText("Property label"), "  Account Tier! ");
        await userEvent.selectOptions(screen.getByLabelText("Property type"), "select");
        await userEvent.type(screen.getByLabelText("Property options"), "gold, silver,");
        await userEvent.click(screen.getByRole("button", { name: "Add property" }));
        expect(await screen.findByText("Could not add the property.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Add property" }));
        expect(api.createProperty).toHaveBeenLastCalledWith("w1", {
            objectType: "company",
            key: "account_tier",
            label: "  Account Tier! ",
            type: "select",
            options: ["gold", "silver"],
        });
        await userEvent.type(screen.getByLabelText("Property label"), "Seats");
        await userEvent.selectOptions(screen.getByLabelText("Property type"), "number");
        await userEvent.click(screen.getByRole("button", { name: "Add property" }));
        expect(api.createProperty).toHaveBeenLastCalledWith("w1", { objectType: "company", key: "seats", label: "Seats", type: "number" });

        const deleteButton = within(screen.getByRole("region", { name: "Properties" })).getByRole("button", { name: "Delete" });
        await userEvent.click(deleteButton);
        expect(api.deleteProperty).not.toHaveBeenCalled();
        await userEvent.click(deleteButton);
        expect(api.deleteProperty).toHaveBeenCalledWith("w1", "p1");
    });

    it("says when there's no mailbox to send from", async () => {
        inShell(<WorkspaceSettings />);
        expect(await screen.findByText(/You have no mailbox you can send from/)).toBeInTheDocument();
        expect(api.sendableMailboxes).not.toHaveBeenCalled();
        expect(screen.queryByLabelText("Mailbox")).toBeNull();
    });

    it("hides the sender picker when every mailbox is added already, or the mailboxes can't be listed", async () => {
        api.listSenders.mockResolvedValue([{ uid: "s1", fromName: "Acme Sales", fromAddress: "sales@acme.example" }]);
        web.listMailboxes.mockResolvedValue([{ uid: "mb1" }]);
        api.sendableMailboxes.mockResolvedValue([{ uid: "mb1", address: "sales@acme.example", displayName: "Acme Sales" }]);
        const first = inShell(<WorkspaceSettings />);
        expect(await screen.findByText("Acme Sales <sales@acme.example>")).toBeInTheDocument();
        await waitFor(() => expect(api.sendableMailboxes).toHaveBeenCalled());
        expect(screen.queryByLabelText("Mailbox")).toBeNull();
        expect(screen.queryByText(/You have no mailbox/)).toBeNull();
        first.unmount();

        web.listMailboxes.mockRejectedValue(new Error("down"));
        inShell(<WorkspaceSettings />);
        expect(await screen.findByText(/You have no mailbox you can send from/)).toBeInTheDocument();
    });

    it("deletes the workspace for an owner who types its name", async () => {
        api.deleteWorkspace.mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
        const prompt = vi.spyOn(window, "prompt").mockReturnValueOnce("wrong").mockReturnValue("Acme");
        window.localStorage.setItem(WORKSPACE_STORAGE_KEY, "w1");
        inShell(<WorkspaceSettings />);

        const button = await screen.findByRole("button", { name: "Delete this workspace" });
        await userEvent.click(button);
        expect(api.deleteWorkspace).not.toHaveBeenCalled();
        await userEvent.click(button);
        expect(await screen.findByText("Could not delete the workspace.")).toBeInTheDocument();
        const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementationOnce(() => {
            throw new Error("blocked");
        });
        await userEvent.click(button);
        await waitFor(() => expect(assign).toHaveBeenCalledWith("/crm"));
        expect(prompt).toHaveBeenCalledWith("Type the workspace's name, Acme, to delete it.");
        removeItem.mockRestore();
    });

    it("is read-only for members who can't manage, and loads what it can", async () => {
        api.listWorkspaces.mockResolvedValue([workspace({ role: "editor" })]);
        api.listMembers.mockRejectedValue(new Error("x"));
        api.listSenders.mockRejectedValue(new Error("x"));
        api.listProperties.mockRejectedValue(new Error("x"));
        inShell(<WorkspaceSettings />);

        expect(await screen.findByLabelText("Name")).toBeDisabled();
        expect(screen.getByLabelText("Time zone")).toBeDisabled();
        expect(web.listMailboxes).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Delete this workspace" })).not.toBeInTheDocument();
        expect(await screen.findByText("Could not load the members.")).toBeInTheDocument();
        expect(screen.getByText("Could not load the senders.")).toBeInTheDocument();
        expect(screen.getByText("Could not load the properties.")).toBeInTheDocument();
    });

    it("shows roles as text to members who can't manage", async () => {
        api.listWorkspaces.mockResolvedValue([workspace({ role: "viewer" })]);
        api.listSenders.mockResolvedValue([{ uid: "s1", fromName: "Acme", fromAddress: "a@acme.example" }]);
        api.listProperties.mockResolvedValue([property()]);
        inShell(<WorkspaceSettings />);
        expect(await screen.findByText("owner")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    });
});
