// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@rapidmx/web-client/lib/util/api.js";
import { MockAppShell, mockCrmApi, stubBasics, workspace } from "../../fixtures.js";
import * as crmApi from "../../../../apps/shared/crmApi.js";
import CrmShell, { NEW_WORKSPACE, WORKSPACE_STORAGE_KEY, useCrm, workspaceHref } from "../../../../apps/shared/components/CrmShell.js";
import CrmContactsPage from "../../../../apps/crm/index.js";
import CrmCompaniesPage from "../../../../apps/crm/companies/index.js";
import CrmContactPage from "../../../../apps/crm/contacts/[uid].js";
import CrmCompanyPage from "../../../../apps/crm/companies/[uid].js";
import CrmTasksPage from "../../../../apps/crm/tasks/index.js";
import CrmImportsPage from "../../../../apps/crm/imports/index.js";
import CrmSettingsPage from "../../../../apps/crm/settings/index.js";
import Layout from "../../../../apps/crm/_layout.js";

vi.mock("../../../../apps/shared/crmApi.js", (importOriginal) => mockCrmApi(importOriginal));
vi.mock("@rapidmx/web-client/shared/components/layout/AppShell.js", () => ({ default: MockAppShell }));

const api: any = crmApi;
const assign = vi.fn();

function Probe() {
    const crm = useCrm();
    return (
        <p>
            {crm.workspace.name}|{String(crm.canWrite)}|{String(crm.canManage)}|{crm.href("/crm/tasks")}
            <button type="button" onClick={() => void crm.reload()}>
                reload
            </button>
        </p>
    );
}

beforeEach(() => {
    stubBasics(api);
    window.localStorage.clear();
    window.history.replaceState(null, "", "/crm");
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign, pathname: "/crm/tasks", search: "" } });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("CrmShell", () => {
    it("picks the workspace named in the URL, remembers it, and gives pages its roles and links", async () => {
        api.listWorkspaces.mockResolvedValue([workspace(), workspace({ uid: "w2", name: "Beta", role: "viewer" })]);
        (window.location as any).search = "?w=w2";

        render(
            <CrmShell section="tasks">
                <Probe />
            </CrmShell>,
        );

        expect(await screen.findByText("Beta|false|false|/crm/tasks?w=w2")).toBeInTheDocument();
        expect(screen.getByTestId("app-shell").dataset.active).toBe("crm");
        expect(window.localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe("w2");
        expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("link", { name: "Companies" })).toHaveAttribute("href", "/crm/companies?w=w2");

        await userEvent.selectOptions(screen.getByLabelText("Workspace"), "w1");
        expect(assign).toHaveBeenCalledWith("/crm/tasks?w=w1");
        expect(window.localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe("w1");

        await userEvent.click(screen.getByRole("button", { name: "reload" }));
        await waitFor(() => expect(api.listWorkspaces).toHaveBeenCalledTimes(2));
    });

    it("falls back to the remembered workspace, then the first, and treats admins as managers", async () => {
        api.listWorkspaces.mockResolvedValue([workspace(), workspace({ uid: "w2", name: "Beta", role: "admin" })]);
        window.localStorage.setItem(WORKSPACE_STORAGE_KEY, "w2");
        const { unmount } = render(
            <CrmShell section="contacts">
                <Probe />
            </CrmShell>,
        );
        expect(await screen.findByText("Beta|true|true|/crm/tasks?w=w2")).toBeInTheDocument();
        unmount();

        window.localStorage.setItem(WORKSPACE_STORAGE_KEY, "gone");
        render(
            <CrmShell section="contacts">
                <Probe />
            </CrmShell>,
        );
        expect(await screen.findByText("Acme|true|true|/crm/tasks?w=w1")).toBeInTheDocument();
    });

    it("carries on when browser storage is blocked", async () => {
        const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        render(
            <CrmShell section="contacts">
                <Probe />
            </CrmShell>,
        );
        expect(await screen.findByText(/^Acme\|/)).toBeInTheDocument();
        getItem.mockRestore();
        setItem.mockRestore();
    });

    it("asks a caller with no workspace to create one, and opens it", async () => {
        api.listWorkspaces.mockResolvedValue([]);
        api.createWorkspace.mockRejectedValueOnce(new ApiRequestError("You may create at most 10 workspaces.", 400)).mockResolvedValue(workspace({ uid: "new" }));
        render(<CrmShell section="contacts">never shown</CrmShell>);

        await userEvent.type(await screen.findByLabelText("Name"), "Sales");
        await userEvent.click(screen.getByRole("button", { name: "Create workspace" }));
        expect(await screen.findByText("You may create at most 10 workspaces.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Create workspace" }));

        await waitFor(() => expect(assign).toHaveBeenCalledWith("/crm/tasks?w=new"));
        expect(api.createWorkspace).toHaveBeenCalledWith({ name: "Sales", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
        expect(screen.queryByText("never shown")).not.toBeInTheDocument();
    });

    it("creates another workspace from the switcher, and opens it", async () => {
        api.listWorkspaces.mockResolvedValue([workspace(), workspace({ uid: "w2", name: "Beta" })]);
        api.createWorkspace.mockRejectedValueOnce(new ApiRequestError("You may create at most 10 workspaces.", 400)).mockResolvedValue(workspace({ uid: "new" }));
        render(<CrmShell section="contacts">page</CrmShell>);
        const switcher = await screen.findByLabelText("Workspace");
        expect(within(switcher).getAllByRole("option").map((option) => option.textContent)).toEqual(["Acme", "Beta", "+ New workspace…"]);

        // Choosing it opens the dialog, without switching; closing it changes nothing.
        await userEvent.selectOptions(switcher, NEW_WORKSPACE);
        const dialog = await screen.findByRole("dialog", { name: "New workspace" });
        expect(assign).not.toHaveBeenCalled();
        expect(switcher).toHaveValue("w1");
        await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

        await userEvent.selectOptions(switcher, NEW_WORKSPACE);
        const again = await screen.findByRole("dialog", { name: "New workspace" });
        await userEvent.type(within(again).getByLabelText("Name"), "Partners");
        await userEvent.click(within(again).getByRole("button", { name: "Create workspace" }));
        expect(await within(again).findByText("You may create at most 10 workspaces.")).toBeInTheDocument();
        await userEvent.click(within(again).getByRole("button", { name: "Create workspace" }));
        await waitFor(() => expect(assign).toHaveBeenCalledWith("/crm/tasks?w=new"));
        expect(api.createWorkspace).toHaveBeenLastCalledWith({ name: "Partners", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    });

    it("says so when the workspaces can't be loaded", async () => {
        api.listWorkspaces.mockRejectedValue(new Error("down"));
        render(<CrmShell section="contacts">x</CrmShell>);
        expect(await screen.findByText("Could not load your CRM workspaces.")).toBeInTheDocument();
    });

    it("refuses useCrm() outside a shell, and builds workspace links", () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        expect(() => render(<Probe />)).toThrow("useCrm() must be used inside a CrmShell");
        expect(workspaceHref("/crm?x=1", "a b")).toBe("/crm?x=1&w=a%20b");
    });
});

describe("CRM pages", () => {
    it.each([
        ["contacts", () => <CrmContactsPage />, "Contacts"],
        ["companies", () => <CrmCompaniesPage />, "Companies"],
        ["tasks", () => <CrmTasksPage />, "Tasks"],
        ["imports", () => <CrmImportsPage />, "Import"],
        ["settings", () => <CrmSettingsPage />, "Settings"],
    ])("renders the %s page in the shell", async (_name, page, heading) => {
        render(page());
        expect(await screen.findByRole("heading", { level: 1, name: new RegExp(`^${heading}`) })).toBeInTheDocument();
    });

    it("renders a contact's and a company's page", async () => {
        api.getRecord.mockResolvedValueOnce({ uid: "c1", email: "ann@acme.example", firstName: "Ann", tags: [], properties: {}, version: 0 });
        const { unmount } = render(<CrmContactPage params={{ uid: "c1" }} />);
        expect(await screen.findByRole("heading", { name: "Ann" })).toBeInTheDocument();
        unmount();
        api.getRecord.mockResolvedValueOnce({ uid: "co1", name: "Acme Inc", tags: [], properties: {}, version: 0 });
        render(<CrmCompanyPage params={{ uid: "co1" }} />);
        expect(await screen.findByRole("heading", { name: "Acme Inc" })).toBeInTheDocument();
    });

    it("titles the page with the deployment's branding, and links its stylesheet and icon", () => {
        expect(renderToStaticMarkup(<Layout>page</Layout>)).toContain("<title>RapidMX: CRM</title>");
        const branded: string = renderToStaticMarkup(
            <Layout branding={{ companyName: "Power Level", logoUrl: "/logo.png", stylesheetUrl: "/theme.css" } as any}>page</Layout>,
        );
        expect(branded).toContain("<title>Power Level: CRM</title>");
        expect(branded).toContain('href="/logo.png"');
        expect(branded).toContain('href="/theme.css"');
    });
});
