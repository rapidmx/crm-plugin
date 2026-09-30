// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Lists, forms, subscriptions on the record page, bulk list changes, suppressions, and imports into a list.
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@rapidmx/web-client/lib/util/api.js";
import { MockAppShell, contact, list, mockCrmApi, property, stubBasics, workspace } from "../../fixtures.js";
import * as crmApi from "../../../../apps/shared/crmApi.js";
import CrmShell from "../../../../apps/shared/components/CrmShell.js";
import ListManager from "../../../../apps/shared/components/ListManager.js";
import FormManager, { embedCode, formUrl } from "../../../../apps/shared/components/FormManager.js";
import RecordList from "../../../../apps/shared/components/RecordList.js";
import RecordDetail from "../../../../apps/shared/components/RecordDetail.js";
import WorkspaceSettings from "../../../../apps/shared/components/WorkspaceSettings.js";
import ImportWizard from "../../../../apps/shared/components/ImportWizard.js";
import CrmListsPage from "../../../../apps/crm/lists/index.js";
import CrmFormsPage from "../../../../apps/crm/forms/index.js";

vi.mock("../../../../apps/shared/crmApi.js", (importOriginal) => mockCrmApi(importOriginal));
vi.mock("@rapidmx/web-client/shared/components/layout/AppShell.js", () => ({ default: MockAppShell }));

const api: any = crmApi;
const sender = { uid: "s1", fromName: "Acme News", fromAddress: "news@acme.example" };

function inShell(ui: React.ReactElement) {
    return render(<CrmShell section="lists">{ui}</CrmShell>);
}

beforeEach(() => {
    stubBasics(api);
    window.localStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, search: "", origin: "https://mail.example", assign: vi.fn() } });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("ListManager", () => {
    it("lists lists with their counts and links, and creates, edits and deletes them", async () => {
        api.listLists.mockResolvedValue([list(), list({ uid: "l2", name: "VIP", visible: false, doubleOptIn: true, senderUid: "s1" })]);
        api.listSenders.mockResolvedValue([sender]);
        api.createList.mockRejectedValueOnce(new ApiRequestError("A list with double opt-in needs a 'senderUid'.", 400)).mockResolvedValue(list());
        api.updateList.mockResolvedValue(list());
        api.deleteList.mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
        vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
        inShell(<ListManager />);

        expect(await screen.findByText("Newsletter")).toBeInTheDocument();
        expect(screen.getByText("hidden from subscribers")).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: "Subscribers" })[1]).toHaveAttribute("href", "/crm?list=l2&w=w1");

        await userEvent.click(screen.getByRole("button", { name: "+ New list" }));
        await userEvent.type(screen.getByLabelText("Name"), "Offers");
        await userEvent.click(screen.getByLabelText("Ask signups to confirm by email (double opt-in)"));
        await userEvent.click(screen.getByLabelText("Offer it in the preference center"));
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("A list with double opt-in needs a 'senderUid'.")).toBeInTheDocument();
        await userEvent.selectOptions(screen.getByLabelText("Confirmation emails come from"), "s1");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(api.createList).toHaveBeenLastCalledWith("w1", {
            name: "Offers",
            publicName: null,
            description: "",
            publicDescription: "",
            doubleOptIn: true,
            visible: false,
            senderUid: "s1",
        });

        await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]);
        expect(screen.getByLabelText("Name")).toHaveValue("VIP");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(api.updateList).toHaveBeenCalledWith("w1", "l2", expect.objectContaining({ name: "VIP", senderUid: "s1" }));
        await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument());

        await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
        expect(api.deleteList).not.toHaveBeenCalled();
        await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
        expect(await screen.findByText("Could not delete the list.")).toBeInTheDocument();
        await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
        expect(api.deleteList).toHaveBeenLastCalledWith("w1", "l1");
        await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
        await userEvent.click(screen.getByRole("button", { name: "Close" }));
    });

    it("is read-only to members who can't manage, and says so when there are none or they can't be loaded", async () => {
        api.listWorkspaces.mockResolvedValue([workspace({ role: "editor" })]);
        api.listSenders.mockRejectedValue(new Error("x"));
        const { unmount } = render(<CrmListsPage />);
        expect(await screen.findByText("No lists yet.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "+ New list" })).not.toBeInTheDocument();
        unmount();

        api.listLists.mockRejectedValue(new Error("x"));
        inShell(<ListManager />);
        expect(await screen.findByText("Could not load the lists.")).toBeInTheDocument();
    });
});

describe("FormManager", () => {
    const form = (overrides: Record<string, unknown> = {}) => ({
        uid: "f1",
        name: "Footer",
        title: "Join",
        fields: [{ target: "email", label: "Email", required: true }],
        listUids: ["l1"],
        doubleOptIn: true,
        senderUid: "s1",
        successMessage: "Thanks!",
        tags: ["web"],
        enabled: true,
        submissionCount: 7,
        ...overrides,
    });

    it("lists forms with their links, copies embed code, and deletes them", async () => {
        api.listForms.mockResolvedValue([form(), form({ uid: "f2", name: "Off", enabled: false })]);
        api.deleteForm.mockResolvedValue(undefined);
        const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error("denied"));
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
        vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
        render(<CrmFormsPage />);

        expect(await screen.findAllByText("7 submissions")).toHaveLength(2);
        expect(screen.getByText("off")).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: "Open form" })[0]).toHaveAttribute("href", "https://mail.example/f/f1");
        await userEvent.click(screen.getAllByRole("button", { name: "Copy embed code" })[0]);
        expect(writeText).toHaveBeenCalledWith(embedCode("f1"));
        await userEvent.click(screen.getAllByRole("button", { name: "Copy embed code" })[0]);
        expect(await screen.findByText("Could not copy the embed code.")).toBeInTheDocument();
        await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]);
        expect(api.deleteForm).not.toHaveBeenCalled();
        await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]);
        expect(api.deleteForm).toHaveBeenCalledWith("w1", "f2");
        expect(formUrl("a b")).toBe("https://mail.example/f/a%20b");
    });

    it("builds a new form: fields, lists, double opt-in, sender, message, redirect and tags", async () => {
        api.listLists.mockResolvedValue([list(), list({ uid: "l2", name: "VIP" })]);
        api.listSenders.mockResolvedValue([sender]);
        api.listProperties.mockResolvedValue([property()]);
        api.createForm.mockRejectedValueOnce(new ApiRequestError("'redirectUrl' must be an https:// address.", 400)).mockResolvedValue(form());
        inShell(<FormManager />);

        await userEvent.click(await screen.findByRole("button", { name: "+ New form" }));
        await userEvent.type(screen.getByLabelText("Name (only members see it)"), "Popup");
        await userEvent.type(screen.getByLabelText("Heading"), "x");
        await userEvent.clear(screen.getByLabelText("Heading"));
        await userEvent.type(screen.getByLabelText("Text under the heading"), "Monthly news");
        await userEvent.selectOptions(screen.getByLabelText("Add a field"), "firstName");
        await userEvent.selectOptions(screen.getByLabelText("Add a field"), "properties.plan");
        await userEvent.clear(screen.getByLabelText("Label of firstName"));
        await userEvent.type(screen.getByLabelText("Label of firstName"), "Your name");
        await userEvent.click(within(screen.getByLabelText("Label of firstName").parentElement!).getByLabelText("Required"));
        await userEvent.click(screen.getByRole("button", { name: "Remove properties.plan" }));
        await userEvent.click(screen.getByLabelText("VIP"));
        await userEvent.click(screen.getByLabelText("Newsletter"));
        await userEvent.click(screen.getByLabelText("Newsletter"));
        await userEvent.selectOptions(screen.getByLabelText("Confirmation emails come from"), "s1");
        await userEvent.clear(screen.getByLabelText("Message once submitted"));
        await userEvent.type(screen.getByLabelText("Message once submitted"), "Welcome!");
        await userEvent.type(screen.getByLabelText("Or go to this page (https://)"), "http://x");
        await userEvent.type(screen.getByLabelText("Tag contacts with (comma-separated)"), "web, popup,");
        await userEvent.click(screen.getByLabelText("Take submissions"));
        await userEvent.click(screen.getByLabelText("Ask signups to confirm by email (double opt-in)"));
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("'redirectUrl' must be an https:// address.")).toBeInTheDocument();
        await userEvent.clear(screen.getByLabelText("Or go to this page (https://)"));
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(api.createForm).toHaveBeenLastCalledWith("w1", {
            name: "Popup",
            title: "Popup",
            description: "Monthly news",
            fields: [
                { target: "email", label: "Email", required: true },
                { target: "firstName", label: "Your name", required: true },
            ],
            listUids: ["l2"],
            doubleOptIn: false,
            senderUid: "s1",
            successMessage: "Welcome!",
            redirectUrl: null,
            tags: ["web", "popup"],
            enabled: false,
        });
    });

    it("edits a form, and copes with lists that can't be loaded", async () => {
        api.listForms.mockResolvedValue([form({ description: "Hi", redirectUrl: "https://x.example" })]);
        api.updateForm.mockResolvedValue(form());
        const first = inShell(<FormManager />);
        await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
        expect(screen.getByLabelText("Heading")).toHaveValue("Join");
        expect(screen.getByText("No lists yet: the form only collects contacts.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Close" }));
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(api.updateForm).toHaveBeenCalledWith("w1", "f1", expect.objectContaining({ description: "Hi", redirectUrl: "https://x.example", senderUid: "s1" }));
        first.unmount();

        vi.clearAllMocks();
        stubBasics(api);
        api.listLists.mockRejectedValue(new Error("x"));
        api.listForms.mockRejectedValue(new Error("x"));
        const { unmount } = inShell(<FormManager />);
        expect(await screen.findByText("Could not load the forms.")).toBeInTheDocument();
        await userEvent.click(screen.getAllByRole("button", { name: "+ New form" })[0]);
        expect(await screen.findByText("Could not load the lists, senders and properties.")).toBeInTheDocument();
        unmount();

        api.listWorkspaces.mockResolvedValue([workspace({ role: "viewer" })]);
        api.listForms.mockResolvedValue([form()]);
        inShell(<FormManager />);
        expect(await screen.findByText("Footer")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    });
});

describe("lists elsewhere in the CRM", () => {
    it("opens a list's subscribers from ?list=, and adds and removes the selected contacts to and from lists", async () => {
        (window.location as any).search = "?list=l1";
        api.listLists.mockResolvedValue([list()]);
        api.searchRecords.mockResolvedValue({ items: [contact()], total: 1 });
        api.setSubscriptions.mockRejectedValueOnce(new Error("x")).mockResolvedValue({ changed: 1 });
        render(
            <CrmShell section="contacts">
                <RecordList objectType="contact" />
            </CrmShell>,
        );

        await waitFor(() =>
            expect(api.searchRecords).toHaveBeenLastCalledWith("contact", "w1", expect.objectContaining({ filter: { field: "lists", op: "eq", value: "l1" } })),
        );
        expect(screen.getByLabelText("Value 1")).toHaveValue("l1");

        await userEvent.click(await screen.findByLabelText("Select Ann Archer"));
        await userEvent.click(screen.getByRole("button", { name: "Add to list" }));
        await userEvent.selectOptions(screen.getByLabelText("List"), "l1");
        await userEvent.click(screen.getByRole("button", { name: "Add" }));
        expect(await screen.findByText("Could not change the selected contacts' subscriptions.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Remove from list" }));
        await userEvent.selectOptions(screen.getByLabelText("List"), "l1");
        await userEvent.click(screen.getByRole("button", { name: "Remove" }));
        expect(api.setSubscriptions).toHaveBeenLastCalledWith("w1", { listUid: "l1", contactUids: ["c1"], status: "unsubscribed" });
        await userEvent.click(await screen.findByLabelText("Select Ann Archer"));
        await userEvent.click(screen.getByRole("button", { name: "Add to list" }));
        await userEvent.click(screen.getByRole("button", { name: "Close" }));
    });

    it("loads no lists when they can't be read", async () => {
        api.listLists.mockRejectedValue(new Error("x"));
        api.searchRecords.mockResolvedValue({ items: [contact()], total: 1 });
        render(
            <CrmShell section="contacts">
                <RecordList objectType="contact" />
            </CrmShell>,
        );
        await userEvent.click(await screen.findByLabelText("Select Ann Archer"));
        expect(screen.queryByRole("button", { name: "Add to list" })).not.toBeInTheDocument();
    });

    it("shows and changes a contact's subscriptions on its page", async () => {
        api.getRecord.mockResolvedValue(contact({ emailStatus: "bounced" }));
        api.listLists.mockResolvedValue([list(), list({ uid: "l2", name: "VIP" }), list({ uid: "l3", name: "Old" })]);
        api.listSubscriptions.mockResolvedValue([
            { uid: "s1", listUid: "l1", status: "subscribed" },
            { uid: "s2", listUid: "l3", status: "pending" },
        ]);
        api.setSubscriptions.mockRejectedValueOnce(new Error("x")).mockResolvedValue({ changed: 1 });
        render(
            <CrmShell section="contacts">
                <RecordDetail objectType="contact" uid="c1" />
            </CrmShell>,
        );

        const section = await screen.findByRole("region", { name: "Subscriptions" });
        expect(within(section).getByText("No marketing email is sent to this contact (bounced).")).toBeInTheDocument();
        expect(within(section).getByText("Awaiting confirmation")).toBeInTheDocument();
        expect(within(section).getByText("Not subscribed")).toBeInTheDocument();
        await userEvent.click(within(section).getByRole("button", { name: "Unsubscribe" }));
        expect(await within(section).findByText("Could not change the subscription.")).toBeInTheDocument();
        await userEvent.click(within(section).getByRole("button", { name: "Unsubscribe" }));
        expect(api.setSubscriptions).toHaveBeenLastCalledWith("w1", { listUid: "l1", contactUids: ["c1"], status: "unsubscribed" });
        await userEvent.click(within(section).getAllByRole("button", { name: "Subscribe" })[0]);
        expect(api.setSubscriptions).toHaveBeenLastCalledWith("w1", { listUid: "l2", contactUids: ["c1"], status: "subscribed" });
    });

    it("says so when a contact's subscriptions can't be loaded, or there are no lists", async () => {
        api.getRecord.mockResolvedValue(contact());
        api.listSubscriptions.mockRejectedValue(new Error("x"));
        const { unmount } = render(
            <CrmShell section="contacts">
                <RecordDetail objectType="contact" uid="c1" />
            </CrmShell>,
        );
        expect(await screen.findByText("Could not load the subscriptions.")).toBeInTheDocument();
        unmount();
        api.listSubscriptions.mockResolvedValue([]);
        render(
            <CrmShell section="contacts">
                <RecordDetail objectType="contact" uid="c1" />
            </CrmShell>,
        );
        expect(await screen.findByText("The workspace has no lists yet.")).toBeInTheDocument();
    });

    it("manages the suppression list in the settings", async () => {
        api.listSuppressions.mockResolvedValue([
            { uid: "x1", email: "gone@x.example", reason: "hard_bounce" },
            { uid: "x2", email: "odd@x.example", reason: "other" },
        ]);
        api.createSuppression.mockRejectedValueOnce(new ApiRequestError("gone@x.example is already suppressed.", 409)).mockResolvedValue({});
        api.deleteSuppression.mockResolvedValue(undefined);
        inShell(<WorkspaceSettings />);

        expect(await screen.findByText("(bounced)")).toBeInTheDocument();
        expect(screen.getByText("(other)")).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText("Suppressed address"), "gone@x.example");
        await userEvent.click(screen.getByRole("button", { name: "Add address" }));
        expect(await screen.findByText("gone@x.example is already suppressed.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Add address" }));
        await waitFor(() => expect(screen.getByLabelText("Suppressed address")).toHaveValue(""));
        await userEvent.click(within(screen.getByRole("region", { name: "Suppressions" })).getAllByRole("button", { name: "Remove" })[0]);
        expect(api.deleteSuppression).toHaveBeenCalledWith("w1", "x1");

        vi.clearAllMocks();
        stubBasics(api);
        api.listSuppressions.mockRejectedValue(new Error("x"));
        api.listWorkspaces.mockResolvedValue([workspace({ role: "viewer" })]);
        inShell(<WorkspaceSettings />);
        expect(await screen.findByText("Could not load the suppression list.")).toBeInTheDocument();
    });

    it("subscribes a contact import to the chosen list", async () => {
        api.listLists.mockResolvedValue([list()]);
        api.uploadImport.mockResolvedValue({
            import: { uid: "i1", fileName: "a.csv", totalRows: 1, objectType: "contact", mapping: [{ column: "email", target: "email" }] },
            targets: ["email"],
            preview: [],
        });
        api.startImport.mockResolvedValue({});
        inShell(<ImportWizard />);
        await userEvent.upload(await screen.findByLabelText("CSV file"), new File(["x"], "a.csv"));
        await userEvent.click(screen.getByRole("button", { name: "Upload" }));
        await userEvent.selectOptions(await screen.findByLabelText("Subscribe everyone imported to"), "l1");
        await userEvent.click(screen.getByRole("button", { name: "Start import" }));
        expect(api.startImport).toHaveBeenCalledWith("w1", "i1", expect.objectContaining({ listUid: "l1" }));
    });

    it("offers no list for a company import", async () => {
        api.listLists.mockRejectedValueOnce(new Error("x")).mockResolvedValue([list()]);
        api.uploadImport.mockResolvedValue({
            import: { uid: "i1", fileName: "a.csv", totalRows: 1, objectType: "company", mapping: [{ column: "name", target: "name" }] },
            targets: ["name"],
            preview: [["Acme"]],
        });
        inShell(<ImportWizard />);
        await userEvent.upload(await screen.findByLabelText("CSV file"), new File(["x"], "a.csv"));
        await userEvent.click(screen.getByRole("button", { name: "Upload" }));
        expect(await screen.findByRole("cell", { name: "Acme" })).toBeInTheDocument();
        expect(screen.queryByLabelText("Subscribe everyone imported to")).not.toBeInTheDocument();
    });
});
