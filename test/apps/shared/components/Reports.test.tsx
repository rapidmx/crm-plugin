// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Reports and their charts, webhooks and API keys, and the admin console's CRM page.
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@rapidmx/web-client/lib/util/api.js";
import { MockAppShell, mockCrmApi, pipeline, stubBasics, workspace } from "../../fixtures.js";
import * as crmApi from "../../../../apps/shared/crmApi.js";
import CrmShell from "../../../../apps/shared/components/CrmShell.js";
import { ColumnChart, LineChart, niceMax, shortDate } from "../../../../apps/shared/components/reports/Charts.js";
import Reports from "../../../../apps/shared/components/reports/Reports.js";
import Integrations from "../../../../apps/shared/components/Integrations.js";
import CrmAdmin, { ADMIN_PAGE_SIZE } from "../../../../apps/shared/components/admin/CrmAdmin.js";
import CrmReportsPage from "../../../../apps/crm/reports/index.js";
import CrmIntegrationsPage from "../../../../apps/crm/integrations/index.js";
import CrmAdminPage from "../../../../apps/admin-crm/index.js";
import AdminLayout from "../../../../apps/admin-crm/_layout.js";

vi.mock("../../../../apps/shared/crmApi.js", (importOriginal) => mockCrmApi(importOriginal));
vi.mock("@rapidmx/web-client/shared/components/layout/AppShell.js", () => ({ default: MockAppShell }));
vi.mock("@rapidmx/web-client/shared/components/admin/layout/AdminShell.js", () => ({
    default: ({ active, children }: any) => <div data-testid={`admin-${active}`}>{children}</div>,
}));

const api: any = crmApi;
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const DAYS = ["2026-09-28", "2026-09-29", "2026-09-30"];

function inShell(ui: React.ReactElement, role: string = "owner") {
    api.listWorkspaces.mockResolvedValue([workspace({ role })]);
    return render(<CrmShell section="reports">{ui}</CrmShell>);
}

const email = (overrides: Record<string, unknown> = {}) => ({
    days: DAYS.map((date, index) => ({ date, sent: index * 10, opened: index * 4, clicked: index, replied: 0, bounced: 0, unsubscribed: 0 })),
    totals: { sent: 30, opened: 12, clicked: 3, replied: 1, bounced: 2, unsubscribed: 1, complained: 0 },
    domains: [{ domain: "gmail.example", sent: 20, opened: 10, clicked: 2 }],
    ...overrides,
});
const growth = (overrides: Record<string, unknown> = {}) => ({
    days: DAYS.map((date, index) => ({ date, contacts: index, subscribed: index * 2, unsubscribed: 1 })),
    contacts: 120,
    lists: [{ uid: "l1", name: "News", subscribed: 80 }],
    ...overrides,
});
const sales = (overrides: Record<string, unknown> = {}) => ({
    days: DAYS.map((date, index) => ({ date, created: 1, won: index, wonAmount: index * 500, lost: 0 })),
    open: { count: 4, amount: 9000 },
    won: { count: 3, amount: 1500 },
    lost: 1,
    ...overrides,
});
const endpoint = (overrides: Record<string, unknown> = {}) => ({
    uid: "w1",
    workspaceUid: "w1",
    url: "https://hooks.example.com/in",
    events: ["*"],
    enabled: true,
    description: "Zapier",
    failureCount: 0,
    secretHint: "…abcd",
    ...overrides,
});
const apiKey = (overrides: Record<string, unknown> = {}) => ({
    uid: "k1",
    workspaceUid: "w1",
    name: "Website",
    prefix: "crm_abcdefgh",
    scopes: ["contacts", "events"],
    createdByUserUid: "u1",
    ...overrides,
});

beforeEach(() => {
    stubBasics(api);
    api.emailReport.mockResolvedValue(email());
    api.growthReport.mockResolvedValue(growth());
    api.salesReport.mockResolvedValue(sales());
    window.localStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, search: "", pathname: "/crm/reports", assign: vi.fn(), origin: "https://mail.example.com" } });
    vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe("charts", () => {
    it("rounds the axis up to 1, 2 or 5 of a power of ten, and names days", () => {
        expect([0, -1, 1, 3, 7, 10, 11, 180, 4500].map(niceMax)).toEqual([1, 1, 1, 5, 10, 10, 20, 200, 5000]);
        expect(shortDate("2026-03-04")).toMatch(/Mar 4|4 Mar/);
    });

    it("draws labelled lines with a crosshair card on hover or from the keyboard, and a table instead", async () => {
        const series = [
            { key: "a", label: "Sent", slot: 1 as const, values: [1, 5, 9] },
            { key: "b", label: "Opened", slot: 2 as const, values: [0, 5, 9] },
        ];
        render(<LineChart title="Messages" days={DAYS} series={series} />);
        const figure = screen.getByRole("figure");
        expect(within(figure).getByLabelText("Legend")).toHaveTextContent("SentOpened");
        const chart = screen.getByRole("img", { name: /Messages, Sep 28 to Sep 30|Messages, 28 Sep to 30 Sep/ });
        expect(chart.querySelectorAll("path")).toHaveLength(2);
        // The end labels are pushed apart when the lines end together.
        const labels = [...chart.querySelectorAll("text")].filter((text) => ["Sent", "Opened"].includes(text.textContent));
        expect(Math.abs(Number(labels[0].getAttribute("y")) - Number(labels[1].getAttribute("y")))).toBeGreaterThanOrEqual(12);

        fireEvent.mouseMove(chart, { clientX: 0 });
        expect(screen.getByRole("status")).toHaveTextContent(/Sent1Opened0/);
        vi.spyOn(chart, "getBoundingClientRect").mockReturnValue({ left: 0, width: 640, top: 0, height: 200 } as DOMRect);
        fireEvent.mouseMove(chart, { clientX: 540 });
        expect(screen.getByRole("status")).toHaveTextContent(/Sent9Opened9/);
        expect(chart.querySelectorAll("circle")).toHaveLength(2);
        fireEvent.mouseLeave(chart);
        expect(screen.queryByRole("status")).toBeNull();

        fireEvent.keyDown(chart, { key: "ArrowLeft" });
        expect(screen.getByRole("status")).toHaveTextContent(/Sent9/);
        fireEvent.keyDown(chart, { key: "ArrowLeft" });
        expect(screen.getByRole("status")).toHaveTextContent(/Sent5/);
        fireEvent.keyDown(chart, { key: "Home" });
        fireEvent.keyDown(chart, { key: "ArrowLeft" });
        expect(screen.getByRole("status")).toHaveTextContent(/Sent1/);
        fireEvent.keyDown(chart, { key: "End" });
        fireEvent.keyDown(chart, { key: "ArrowRight" });
        expect(screen.getByRole("status")).toHaveTextContent(/Sent9/);
        fireEvent.keyDown(chart, { key: "a" });
        fireEvent.keyDown(chart, { key: "Escape" });
        expect(screen.queryByRole("status")).toBeNull();
        fireEvent.keyDown(chart, { key: "ArrowRight" });
        fireEvent.blur(chart);
        expect(screen.queryByRole("status")).toBeNull();

        await userEvent.click(button("Show table"));
        expect(screen.getAllByRole("row")).toHaveLength(4);
        expect(screen.getAllByRole("row")[3]).toHaveTextContent(/9\s*9/);
        await userEvent.click(button("Show chart"));
        expect(screen.getByRole("img")).toBeInTheDocument();
    });

    it("draws one day in the middle, and a card that flips to the left near the right edge", () => {
        render(<LineChart title="One" days={["2026-09-30"]} series={[{ key: "a", label: "Sent", slot: 1, values: [3] }]} format={(value) => `${value}!`} />);
        const chart = screen.getByRole("img");
        expect(chart.querySelector("path")!.getAttribute("d")).toBe("M294.0,77.6");
        fireEvent.keyDown(chart, { key: "End" });
        expect(screen.getByRole("status")).toHaveTextContent("Sent3!");
        expect(screen.getByRole("status").style.left).not.toBe("");
    });

    it("draws columns with a card per day, and none for an empty day", async () => {
        render(<ColumnChart title="Won" label="Value won" days={DAYS} values={[0, 500, 2000]} />);
        const chart = screen.getByRole("img");
        expect(chart.querySelectorAll("path")).toHaveLength(2);
        fireEvent.mouseEnter(chart.querySelectorAll("rect")[2].parentElement!);
        expect(screen.getByRole("status")).toHaveTextContent(/Value won2,000/);
        expect(screen.getByRole("status").style.right).not.toBe("");
        fireEvent.mouseLeave(chart);
        fireEvent.keyDown(chart, { key: "Home" });
        expect(screen.getByRole("status")).toHaveTextContent(/Value won0/);
        fireEvent.blur(chart);
        expect(screen.queryByLabelText("Legend")).toBeNull();
        await userEvent.click(button("Show table"));
        expect(screen.getByRole("columnheader", { name: "Value won" })).toBeInTheDocument();
    });
});

describe("Reports", () => {
    it("shows email, audience and sales for a period and pipeline", async () => {
        api.listPipelines.mockResolvedValue([pipeline()]);
        render(<CrmReportsPage />);
        expect(await screen.findByRole("heading", { name: "Email" })).toBeInTheDocument();
        expect(screen.getByText("40.0%")).toBeInTheDocument();
        expect(screen.getByText("gmail.example")).toBeInTheDocument();
        expect(screen.getByText("50.0%")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: /Messages per day/ })).toBeInTheDocument();
        expect(screen.getByRole("img", { name: /Audience per day/ })).toBeInTheDocument();
        expect(screen.getByRole("img", { name: /Value won per day/ })).toBeInTheDocument();
        expect(screen.getByText("News")).toBeInTheDocument();
        expect(screen.getByText("75.0%")).toBeInTheDocument();
        expect(api.salesReport).toHaveBeenLastCalledWith("w1", 30, undefined);

        await userEvent.selectOptions(screen.getByLabelText("Period"), "90");
        await waitFor(() => expect(api.emailReport).toHaveBeenLastCalledWith("w1", 90));
        await userEvent.selectOptions(screen.getByLabelText("Pipeline"), pipeline().uid);
        await waitFor(() => expect(api.salesReport).toHaveBeenLastCalledWith("w1", 90, pipeline().uid));
    });

    it("says when nothing was sent, leaves out empty lists, and shows errors", async () => {
        api.listPipelines.mockRejectedValue(new Error("down"));
        api.emailReport.mockResolvedValue(email({ domains: [], totals: { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, unsubscribed: 0, complained: 0 } }));
        api.growthReport.mockResolvedValue(growth({ lists: [] }));
        api.salesReport.mockResolvedValue(sales({ won: { count: 0, amount: 0 }, lost: 0 }));
        inShell(<Reports />);
        expect(await screen.findByText("Nothing was sent in this period.")).toBeInTheDocument();
        expect(screen.queryByText("Subscribers by list")).toBeNull();
        expect(screen.getByText("of 0 closed")).toBeInTheDocument();

        api.emailReport.mockRejectedValue(new ApiRequestError("Reports are down.", 500));
        await userEvent.selectOptions(screen.getByLabelText("Period"), "7");
        expect(await screen.findByText("Reports are down.")).toBeInTheDocument();
    });

    it("ignores an answer that arrives after the period changed", async () => {
        let answer: (value: any) => void = () => undefined;
        api.emailReport.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
        inShell(<Reports />);
        await screen.findByLabelText("Period");
        await userEvent.selectOptions(screen.getByLabelText("Period"), "7");
        expect(await screen.findByText("gmail.example")).toBeInTheDocument();
        await act(async () => answer(email({ domains: [{ domain: "late.example", sent: 1, opened: 0, clicked: 0 }] })));
        expect(screen.queryByText("late.example")).toBeNull();
    });

    it("ignores a failure that arrives after the period changed", async () => {
        let fail: (err: unknown) => void = () => undefined;
        api.emailReport.mockImplementationOnce(() => new Promise((_resolve, reject) => (fail = reject)));
        inShell(<Reports />);
        await screen.findByLabelText("Period");
        await userEvent.selectOptions(screen.getByLabelText("Period"), "7");
        expect(await screen.findByText("gmail.example")).toBeInTheDocument();
        await act(async () => fail(new Error("late")));
        expect(screen.queryByRole("alert")).toBeNull();
    });
});

describe("Integrations", () => {
    beforeEach(() => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async () => undefined) } });
    });

    it("adds webhooks for every event or chosen ones, showing the secret once", async () => {
        api.listWebhooks.mockResolvedValueOnce([]).mockResolvedValue([endpoint()]);
        api.createWebhook.mockResolvedValueOnce(endpoint({ secret: "whsec_new" })).mockResolvedValueOnce(endpoint({ uid: "w2" }));
        render(<CrmIntegrationsPage />);
        expect(await screen.findByText("No webhooks yet.")).toBeInTheDocument();
        expect(screen.getByText("No API keys yet.")).toBeInTheDocument();
        expect(screen.getByText("https://mail.example.com/api/mail/crm/integrations/w1")).toBeInTheDocument();
        const add = within(screen.getByRole("form", { name: "Add a webhook" }));
        expect(add.getByRole("button", { name: "Add webhook" })).toBeDisabled();
        await userEvent.type(add.getByLabelText("Address (https)"), "https://hooks.example.com/in");
        await userEvent.type(add.getByLabelText("Description"), "Zapier");
        await userEvent.click(add.getByRole("button", { name: "Add webhook" }));
        expect(api.createWebhook).toHaveBeenCalledWith("w1", { url: "https://hooks.example.com/in", events: ["*"], description: "Zapier" });
        const shown = await screen.findByRole("alert");
        expect(shown).toHaveTextContent("whsec_new");
        await userEvent.click(within(shown).getByRole("button", { name: "Copy" }));
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith("whsec_new");
        await userEvent.click(within(shown).getByRole("button", { name: "Done" }));
        expect(screen.queryByText("whsec_new")).toBeNull();
        expect(screen.getByText("Every event · Zapier · secret …abcd")).toBeInTheDocument();

        await userEvent.type(add.getByLabelText("Address (https)"), "https://b.example.com");
        await userEvent.click(add.getByLabelText("Every event"));
        expect(add.getByRole("button", { name: "Add webhook" })).toBeDisabled();
        await userEvent.click(add.getByLabelText("deal.won"));
        await userEvent.click(add.getByLabelText("deal.lost"));
        await userEvent.click(add.getByLabelText("deal.lost"));
        await userEvent.click(add.getByRole("button", { name: "Add webhook" }));
        expect(api.createWebhook).toHaveBeenLastCalledWith("w1", { url: "https://b.example.com", events: ["deal.won"], description: undefined });
        await waitFor(() => expect(add.getByLabelText("Every event")).toBeChecked());
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("tests, switches, re-keys, lists deliveries of and deletes webhooks", async () => {
        api.listWebhooks.mockResolvedValue([
            endpoint(),
            endpoint({ uid: "w2", url: "https://b.example.com/", events: ["deal.won", "deal.lost"], description: null, enabled: false, failureCount: 20, lastError: "The endpoint answered 500." }),
        ]);
        api.testWebhook
            .mockResolvedValueOnce({ status: 204 })
            .mockResolvedValueOnce({ status: 500 })
            .mockResolvedValueOnce({ error: "The address resolves to a private network." })
            .mockRejectedValueOnce(new ApiRequestError("Gone.", 404));
        api.rotateWebhookSecret.mockResolvedValue({ secret: "whsec_rotated" });
        api.webhookDeliveries
            .mockResolvedValueOnce([
                { uid: "d1", endpointUid: "w1", eventType: "contact.created", status: "delivered", attempts: 1, responseStatus: 200, lastError: null, dateCreated: "2026-09-30T10:00:00Z" },
                { uid: "d2", endpointUid: "w1", eventType: "deal.won", status: "pending", attempts: 2, lastError: "The endpoint answered 503.", dateCreated: "2026-09-30T11:00:00Z" },
            ])
            .mockResolvedValueOnce([])
            .mockRejectedValueOnce(new ApiRequestError("No deliveries.", 500));
        inShell(<Integrations />);
        const first = (await screen.findByText("https://hooks.example.com/in")).closest("li")!;
        const second = screen.getByText("https://b.example.com/").closest("li")!;
        expect(second).toHaveTextContent("deal.won, deal.lost · secret …abcd");
        expect(second).toHaveTextContent("Off · 20 failed in a row · The endpoint answered 500.");

        for (const text of ["Delivered (204)", "The endpoint answered 500.", "Failed: The address resolves to a private network.", "Gone."]) {
            await userEvent.click(within(first).getByRole("button", { name: "Test" }));
            expect(await within(first).findByText(text)).toBeInTheDocument();
        }

        await userEvent.click(within(second).getByRole("button", { name: "Switch on" }));
        expect(api.updateWebhook).toHaveBeenCalledWith("w1", "w2", { enabled: true });
        await userEvent.click(within(first).getByRole("button", { name: "Switch off" }));
        expect(api.updateWebhook).toHaveBeenLastCalledWith("w1", "w1", { enabled: false });

        await userEvent.click(within(first).getByRole("button", { name: "New secret" }));
        expect(await screen.findByText("whsec_rotated")).toBeInTheDocument();
        (window.confirm as any).mockReturnValueOnce(false);
        await userEvent.click(within(first).getByRole("button", { name: "New secret" }));
        expect(api.rotateWebhookSecret).toHaveBeenCalledTimes(1);

        await userEvent.click(within(first).getByRole("button", { name: "Deliveries" }));
        expect(await within(first).findByText("contact.created")).toBeInTheDocument();
        expect(within(first).getByText("delivered (200)")).toBeInTheDocument();
        expect(within(first).getByText("The endpoint answered 503.")).toBeInTheDocument();
        await userEvent.click(within(second).getByRole("button", { name: "Deliveries" }));
        expect(await within(second).findByText("Nothing has been sent to it yet.")).toBeInTheDocument();
        await userEvent.click(within(second).getByRole("button", { name: "Deliveries" }));
        await userEvent.click(within(second).getByRole("button", { name: "Deliveries" }));
        expect(await within(second).findByText("No deliveries.")).toBeInTheDocument();

        (window.confirm as any).mockReturnValueOnce(false);
        await userEvent.click(within(first).getByRole("button", { name: "Delete" }));
        expect(api.deleteWebhook).not.toHaveBeenCalled();
        api.deleteWebhook.mockRejectedValueOnce(new ApiRequestError("Could not.", 500));
        await userEvent.click(within(first).getByRole("button", { name: "Delete" }));
        expect(await screen.findByText("Could not.")).toBeInTheDocument();
    });

    it("makes, lists and revokes API keys, showing a key once", async () => {
        api.listApiKeys.mockResolvedValueOnce([]).mockResolvedValue([apiKey(), apiKey({ uid: "k2", name: "Shop", scopes: ["subscriptions"], lastUsedAt: "2026-09-30T10:00:00Z" })]);
        api.createApiKey.mockResolvedValueOnce(apiKey({ key: "crm_secretkey" })).mockRejectedValueOnce(new ApiRequestError("Too many keys.", 400));
        inShell(<Integrations />);
        const form = within(await screen.findByRole("form", { name: "Make an API key" }));
        expect(form.getByRole("button", { name: "Make key" })).toBeDisabled();
        await userEvent.type(form.getByLabelText("Name"), "Website");
        await userEvent.click(form.getByLabelText("Subscribe and unsubscribe"));
        await userEvent.click(form.getByRole("button", { name: "Make key" }));
        expect(api.createApiKey).toHaveBeenCalledWith("w1", { name: "Website", scopes: ["contacts", "events"] });
        expect(await screen.findByText("crm_secretkey")).toBeInTheDocument();
        await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Done" }));
        expect(screen.queryByText("crm_secretkey")).toBeNull();
        const row = screen.getByText("Website").closest("tr")!;
        expect(row).toHaveTextContent("crm_abcdefgh…");
        expect(row).toHaveTextContent("Add and update contacts, Report events");
        expect(screen.getByText("Shop").closest("tr")).toHaveTextContent("Subscribe and unsubscribe");

        for (const scope of ["Add and update contacts", "Subscribe and unsubscribe", "Report events"]) {
            await userEvent.click(form.getByLabelText(scope));
        }
        await userEvent.type(form.getByLabelText("Name"), "More");
        expect(form.getByRole("button", { name: "Make key" })).toBeDisabled();
        await userEvent.click(form.getByLabelText("Report events"));
        await userEvent.click(form.getByRole("button", { name: "Make key" }));
        expect(await screen.findByText("Too many keys.")).toBeInTheDocument();

        (window.confirm as any).mockReturnValueOnce(false);
        await userEvent.click(within(row).getByRole("button", { name: "Revoke" }));
        expect(api.deleteApiKey).not.toHaveBeenCalled();
        await userEvent.click(within(row).getByRole("button", { name: "Revoke" }));
        expect(api.deleteApiKey).toHaveBeenCalledWith("w1", "k1");
        api.deleteApiKey.mockRejectedValueOnce(new Error("x"));
        await userEvent.click(within(row).getByRole("button", { name: "Revoke" }));
        expect(await screen.findByText("Could not revoke the API key.")).toBeInTheDocument();
    });

    it("shows members who aren't admins the webhooks only, and reports load failures", async () => {
        api.listWebhooks.mockResolvedValue([endpoint()]);
        inShell(<Integrations />, "editor");
        const item = (await screen.findByText("https://hooks.example.com/in")).closest("li")!;
        expect(within(item).getAllByRole("button").map((entry) => entry.textContent)).toEqual(["Deliveries"]);
        expect(screen.queryByRole("form", { name: "Add a webhook" })).toBeNull();
        expect(screen.getByText("Only the workspace's admins can see and make API keys.")).toBeInTheDocument();
    });

    it("reports what fails to load or change", async () => {
        api.listWebhooks.mockRejectedValue(new Error("x"));
        api.listApiKeys.mockRejectedValue(new Error("x"));
        inShell(<Integrations />);
        expect(await screen.findByText("Could not load the webhooks.")).toBeInTheDocument();
        expect(screen.getByText("Could not load the API keys.")).toBeInTheDocument();
    });

    it("says why a webhook couldn't be added, and shows no secret without one", async () => {
        api.listWebhooks.mockResolvedValue([]);
        api.createWebhook.mockRejectedValueOnce(new ApiRequestError("'url': The address must be on the public internet.", 400)).mockResolvedValueOnce(endpoint());
        api.createApiKey.mockResolvedValueOnce(apiKey());
        inShell(<Integrations />);
        const add = within(await screen.findByRole("form", { name: "Add a webhook" }));
        await userEvent.type(add.getByLabelText("Address (https)"), "https://10.0.0.1");
        await userEvent.click(add.getByRole("button", { name: "Add webhook" }));
        expect(await screen.findByText(/public internet/)).toBeInTheDocument();
        await userEvent.click(add.getByRole("button", { name: "Add webhook" }));
        await waitFor(() => expect(add.getByLabelText("Address (https)")).toHaveValue(""));
        const keyForm = within(screen.getByRole("form", { name: "Make an API key" }));
        await userEvent.type(keyForm.getByLabelText("Name"), "K");
        await userEvent.click(keyForm.getByRole("button", { name: "Make key" }));
        await waitFor(() => expect(keyForm.getByLabelText("Name")).toHaveValue(""));
        expect(screen.queryByRole("alert")).toBeNull();
    });
});

describe("CrmAdmin", () => {
    const adminWorkspace = (overrides: Record<string, unknown> = {}) => ({
        uid: "w1",
        name: "Acme Sales",
        dateCreated: "2026-09-01T00:00:00Z",
        members: 3,
        contacts: 1200,
        campaignsSent: 4,
        sendingDisabled: false,
        ...overrides,
    });

    it("shows the deployment's numbers and workspaces, and stops and restores a workspace's sending", async () => {
        api.adminStats.mockResolvedValue({ workspaces: 2, contacts: 1300, sentLastDay: 50, queued: 7 });
        api.adminWorkspaces.mockResolvedValue({ items: [adminWorkspace(), adminWorkspace({ uid: "w2", name: "Spammy", sendingDisabled: true })], total: 2 });
        render(<CrmAdminPage />);
        expect(screen.getByTestId("admin-crm")).toBeInTheDocument();
        expect(await screen.findByText("Acme Sales")).toBeInTheDocument();
        expect(screen.getByText("1,300")).toBeInTheDocument();
        expect(screen.getByText("Waiting to send").nextSibling).toHaveTextContent("7");
        expect(screen.getByText("Spammy").closest("tr")).toHaveTextContent("Stopped");
        expect(screen.queryByText(/Page 1 of/)).toBeNull();

        (window.confirm as any).mockReturnValueOnce(false);
        await userEvent.click(button("Stop sending"));
        expect(api.setWorkspaceSending).not.toHaveBeenCalled();
        await userEvent.click(button("Stop sending"));
        expect(api.setWorkspaceSending).toHaveBeenCalledWith("w1", true);
        await userEvent.click(button("Let it send"));
        expect(api.setWorkspaceSending).toHaveBeenLastCalledWith("w2", false);
        api.setWorkspaceSending.mockRejectedValueOnce(new Error("x"));
        await userEvent.click(button("Let it send"));
        expect(await screen.findByText("Could not change the workspace.")).toBeInTheDocument();
    });

    it("pages through workspaces, and says when there are none or they fail to load", async () => {
        api.adminStats.mockResolvedValue({ workspaces: 0, contacts: 0, sentLastDay: 0, queued: 0 });
        api.adminWorkspaces.mockResolvedValue({ items: [adminWorkspace()], total: ADMIN_PAGE_SIZE + 1 });
        const { unmount } = render(<CrmAdmin />);
        expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
        expect(button("Previous")).toBeDisabled();
        await userEvent.click(button("Next"));
        expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
        expect(api.adminWorkspaces).toHaveBeenLastCalledWith(1, ADMIN_PAGE_SIZE);
        expect(button("Next")).toBeDisabled();
        await userEvent.click(button("Previous"));
        await waitFor(() => expect(api.adminWorkspaces).toHaveBeenLastCalledWith(0, ADMIN_PAGE_SIZE));
        unmount();

        api.adminWorkspaces.mockResolvedValue({ items: [], total: 0 });
        const second = render(<CrmAdmin />);
        expect(await screen.findByText("No workspaces yet.")).toBeInTheDocument();
        second.unmount();

        api.adminStats.mockRejectedValue(new Error("x"));
        render(<CrmAdmin />);
        expect(await screen.findByText("Could not load the CRM's workspaces.")).toBeInTheDocument();
    });

    it("titles the admin app after the branding, and links its stylesheet and icon", () => {
        expect(renderToStaticMarkup(<AdminLayout>page</AdminLayout>)).toContain("<title>RapidMX: CRM administration</title>");
        const branded: string = renderToStaticMarkup(<AdminLayout branding={{ title: "Acme", iconUrl: "/i.svg", stylesheetUrl: "/t.css" } as any}>page</AdminLayout>);
        expect(branded).toContain("<title>Acme: CRM administration</title>");
        expect(branded).toContain('href="/i.svg"');
        expect(branded).toContain('href="/t.css"');
    });
});
