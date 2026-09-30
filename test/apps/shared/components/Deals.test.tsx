// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// The deal board, a deal's page, pipeline settings, a contact's deals, logged senders and deal triggers.
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@rapidmx/web-client/lib/util/api.js";
import { MockAppShell, automation, company, contact, deal, member, mockCrmApi, pipeline, stubBasics, workspace } from "../../fixtures.js";
import * as crmApi from "../../../../apps/shared/crmApi.js";
import CrmShell from "../../../../apps/shared/components/CrmShell.js";
import DealBoard from "../../../../apps/shared/components/deals/DealBoard.js";
import DealDetail from "../../../../apps/shared/components/deals/DealDetail.js";
import PipelineManager from "../../../../apps/shared/components/deals/PipelineManager.js";
import { daysInStage, isRotting, money } from "../../../../apps/shared/components/deals/dealUi.js";
import RecordDetail from "../../../../apps/shared/components/RecordDetail.js";
import WorkspaceSettings from "../../../../apps/shared/components/WorkspaceSettings.js";
import AutomationEditor from "../../../../apps/shared/components/automations/AutomationEditor.js";
import CrmDealsPage from "../../../../apps/crm/deals/index.js";
import CrmDealPage from "../../../../apps/crm/deals/[uid].js";
import CrmPipelinesPage from "../../../../apps/crm/pipelines/index.js";

const dnd = vi.hoisted(() => ({ onDragEnd: undefined as undefined | ((event: any) => void) }));

vi.mock("../../../../apps/shared/crmApi.js", (importOriginal) => mockCrmApi(importOriginal));
vi.mock("@rapidmx/web-client/shared/components/layout/AppShell.js", () => ({ default: MockAppShell }));
vi.mock("@dnd-kit/core", async (importOriginal) => {
    const actual: any = await importOriginal();
    return {
        ...actual,
        DndContext: (props: any) => {
            dnd.onDragEnd = props.onDragEnd;
            return <actual.DndContext {...props} />;
        },
    };
});

const api: any = crmApi;
const button = (name: string | RegExp) => screen.getByRole("button", { name });

function inShell(ui: React.ReactElement, role: string = "owner") {
    api.listWorkspaces.mockResolvedValue([workspace({ role })]);
    return render(<CrmShell section="deals">{ui}</CrmShell>);
}

beforeEach(() => {
    stubBasics(api);
    api.listMembers.mockResolvedValue([member(), member({ uid: "m2", userUid: "u2", displayName: "", address: "bea@acme.example" })]);
    window.localStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, search: "", pathname: "/crm/deals", assign: vi.fn() } });
});

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe("deal helpers", () => {
    it("formats money and tells rotting deals", () => {
        expect(money(1200, "USD")).toMatch(/1,200/);
        expect(money(5, "???")).toBe("5 ???");
        const now = new Date("2026-09-30T00:00:00Z");
        expect(daysInStage({ stageChangedAt: "2026-09-20T00:00:00Z" }, now)).toBe(10);
        expect(isRotting({ stageChangedAt: "2026-09-20T00:00:00Z", status: "open" }, { rottingDays: 7 }, now)).toBe(true);
        expect(isRotting({ stageChangedAt: "2026-09-20T00:00:00Z", status: "won" }, { rottingDays: 7 }, now)).toBe(false);
        expect(isRotting({ stageChangedAt: "2026-09-20T00:00:00Z", status: "open" }, undefined, now)).toBe(false);
        expect(daysInStage({ stageChangedAt: new Date().toISOString() })).toBe(0);
    });
});

describe("DealBoard", () => {
    it("shows each stage's deals and numbers, filters by owner, and flags rotting deals", async () => {
        api.listPipelines.mockResolvedValue([pipeline({ isDefault: false, uid: "p0", name: "Partners" }), pipeline()]);
        api.listDeals.mockResolvedValue([
            deal({ stageChangedAt: "2026-01-01T00:00:00.000Z" }),
            deal({ uid: "d2", name: "Beta", stageId: "st2", ownerUserUid: "u2", amount: 500 }),
            deal({ uid: "d3", name: "Closed long ago", stageId: "won", status: "won", closedAt: "2020-01-01T00:00:00.000Z" }),
            deal({ uid: "d4", name: "Just won", stageId: "won", status: "won", closedAt: new Date().toISOString(), ownerUserUid: null }),
        ]);
        api.dealForecast.mockResolvedValue({
            stages: [{ stageId: "st1", count: 1, amount: 1200, weighted: 120 }],
            open: { count: 2, amount: 1700, weighted: 420 },
            won: { count: 1, amount: 100 },
            lost: { count: 1, amount: 100 },
            winRate: 0.5,
            averageDaysToWin: 12.4,
        });
        inShell(<DealBoard />);
        const qualified = within(await screen.findByRole("region", { name: "Qualified" }));
        expect(await qualified.findByText("Acme renewal")).toBeInTheDocument();
        expect(qualified.getByText(/days in this stage/)).toBeInTheDocument();
        expect(qualified.getByText(/10% · \$1,200 \(\$120 weighted\)/)).toBeInTheDocument();
        expect(within(screen.getByRole("region", { name: "Proposal" })).getByText(/bea@acme\.example/)).toBeInTheDocument();
        expect(within(screen.getByRole("region", { name: "Won" })).queryByText("Closed long ago")).not.toBeInTheDocument();
        expect(within(screen.getByRole("region", { name: "Won" })).getByText("Just won")).toBeInTheDocument();
        expect(screen.getByText("2 open · $1,700 ($420 weighted) · 50% won in the last 30 days · 12 days to win")).toBeInTheDocument();
        expect(api.listDeals).toHaveBeenLastCalledWith("w1", { pipelineUid: "p1" });
        await userEvent.selectOptions(screen.getByLabelText("Owner"), "u2");
        await waitFor(() => expect(api.listDeals).toHaveBeenLastCalledWith("w1", { pipelineUid: "p1", ownerUserUid: "u2" }));
        await userEvent.selectOptions(screen.getByLabelText("Pipeline"), "p0");
        await waitFor(() => expect(api.listDeals).toHaveBeenLastCalledWith("w1", { pipelineUid: "p0", ownerUserUid: "u2" }));
    });

    it("moves deals by dragging and by menu, asking why one was lost", async () => {
        api.listDeals.mockResolvedValue([deal()]);
        api.updateDeal.mockRejectedValueOnce(new ApiRequestError("Nope.", 400)).mockResolvedValue(deal());
        vi.spyOn(window, "prompt").mockReturnValueOnce(null).mockReturnValueOnce("  ").mockReturnValue("Too pricey");
        inShell(<DealBoard />);
        await screen.findByText("Acme renewal");
        act(() => dnd.onDragEnd!({ active: { id: "d1" }, over: { id: "st2" } }));
        expect(await screen.findByText("Nope.")).toBeInTheDocument();
        act(() => dnd.onDragEnd!({ active: { id: "d1" }, over: null }));
        act(() => dnd.onDragEnd!({ active: { id: "nope" }, over: { id: "st2" } }));
        act(() => dnd.onDragEnd!({ active: { id: "d1" }, over: { id: "st1" } }));
        expect(api.updateDeal).toHaveBeenCalledTimes(1);
        await userEvent.selectOptions(screen.getByLabelText("Move Acme renewal to"), "lost");
        expect(api.updateDeal).toHaveBeenCalledTimes(1);
        await userEvent.selectOptions(screen.getByLabelText("Move Acme renewal to"), "lost");
        await waitFor(() => expect(api.updateDeal).toHaveBeenLastCalledWith("w1", "d1", { stageId: "lost" }));
        await userEvent.selectOptions(screen.getByLabelText("Move Acme renewal to"), "lost");
        await waitFor(() => expect(api.updateDeal).toHaveBeenLastCalledWith("w1", "d1", { stageId: "lost", lostReason: "Too pricey" }));
        await userEvent.selectOptions(screen.getByLabelText("Move Acme renewal to"), "won");
        await waitFor(() => expect(api.updateDeal).toHaveBeenLastCalledWith("w1", "d1", { stageId: "won" }));
    });

    it("creates deals", async () => {
        api.createDeal.mockRejectedValueOnce(new ApiRequestError("Too many.", 400)).mockResolvedValue(deal());
        inShell(<DealBoard />);
        await userEvent.click(await screen.findByRole("button", { name: "+ New deal" }));
        await userEvent.type(screen.getByLabelText("Name"), "Gamma");
        await userEvent.type(screen.getByLabelText("Amount"), "250");
        await userEvent.clear(screen.getByLabelText("Currency"));
        await userEvent.type(screen.getByLabelText("Currency"), "eur");
        await userEvent.selectOptions(screen.getByLabelText("Stage"), "st2");
        await userEvent.click(button("Create"));
        expect(await screen.findByText("Too many.")).toBeInTheDocument();
        await userEvent.click(button("Create"));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(api.createDeal).toHaveBeenLastCalledWith("w1", { name: "Gamma", amount: 250, currency: "EUR", pipelineUid: "p1", stageId: "st2" });
        await userEvent.click(button("+ New deal"));
        await userEvent.type(screen.getByLabelText("Name"), "Zero");
        await userEvent.click(button("Close"));
    });

    it("says when things can't load, and shows viewers the board without controls", async () => {
        api.listPipelines.mockRejectedValueOnce(new Error("x"));
        api.listMembers.mockRejectedValue(new Error("x"));
        inShell(<DealBoard />);
        expect(await screen.findByText("Could not load the pipelines.")).toBeInTheDocument();
        api.listPipelines.mockResolvedValue([pipeline()]);
        api.listDeals.mockRejectedValueOnce(new Error("x"));
        inShell(<DealBoard />, "viewer");
        expect(await screen.findByText("Could not load the deals.")).toBeInTheDocument();
        api.listDeals.mockResolvedValue([deal()]);
        api.listPipelines.mockResolvedValue([]);
        inShell(<DealBoard />, "viewer");
        await waitFor(() => expect(api.listPipelines).toHaveBeenCalledTimes(3));
        expect(screen.queryByRole("button", { name: "+ New deal" })).not.toBeInTheDocument();
    });

    it("is the deals, deal and pipelines pages", async () => {
        const first = render(<CrmDealsPage {...({} as any)} />);
        expect(await screen.findByRole("heading", { name: "Deals" })).toBeInTheDocument();
        first.unmount();
        api.getDeal.mockResolvedValue(deal());
        const second = render(<CrmDealPage {...({ params: { uid: "d1" } } as any)} />);
        expect(await screen.findByRole("heading", { name: "Acme renewal" })).toBeInTheDocument();
        second.unmount();
        render(<CrmPipelinesPage {...({} as any)} />);
        expect(await screen.findByRole("heading", { name: "Pipelines" })).toBeInTheDocument();
    });
});

describe("DealDetail", () => {
    async function renderDetail(value: any = deal(), role: string = "owner") {
        api.getDeal.mockResolvedValue(value);
        inShell(<DealDetail uid="d1" />, role);
        await screen.findByRole("heading", { name: value.name });
    }

    it("says when the deal can't be loaded", async () => {
        api.getDeal.mockRejectedValue(new ApiRequestError("Not found.", 404));
        inShell(<DealDetail uid="d1" />);
        expect(await screen.findByText("Not found.")).toBeInTheDocument();
    });

    it("shows and changes a deal, and deletes it", async () => {
        api.listPipelines.mockResolvedValue([pipeline(), pipeline({ uid: "p2", name: "Partners", isDefault: false, stages: [{ id: "x1", name: "Intro", probability: 20, kind: "open" }, { id: "x2", name: "Signed", probability: 100, kind: "won" }, { id: "x3", name: "Dropped", probability: 0, kind: "lost" }] })]);
        api.getRecord.mockImplementation(async (type: string, _w: string, uid: string) => {
            if (uid === "gone") {
                throw new Error("x");
            }
            return type === "contact" ? contact({ uid, firstName: uid === "c2" ? "" : "Ann", lastName: uid === "c2" ? "" : "Archer", email: `${uid}@x.example` }) : company();
        });
        api.listTimeline.mockResolvedValue([{ uid: "t1", kind: "deal_created", summary: "Created the deal", occurredAt: "2026-09-01T00:00:00.000Z" }]);
        api.updateDeal.mockRejectedValueOnce(new ApiRequestError("Changed elsewhere.", 409)).mockImplementation(async (_w: string, _u: string, input: any) => deal({ ...input, status: input.stageId === "lost" ? "lost" : "open" }));
        api.deleteDeal.mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
        vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
        await renderDetail(deal({ contactUids: ["c1", "c2", "gone"], companyUid: "co1", expectedCloseDate: "2026-12-01T00:00:00.000Z", stageHistory: [{ stageId: "st1", at: "2026-09-01T00:00:00.000Z" }, { stageId: "old", at: "2026-09-02T00:00:00.000Z" }] }));
        expect(screen.getByText("Created the deal")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Ann Archer" })).toHaveAttribute("href", "/crm/contacts/c1?w=w1");
        expect(screen.getByRole("link", { name: "c2@x.example" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Acme Inc" })).toBeInTheDocument();
        expect(screen.getByText("a stage no longer there")).toBeInTheDocument();
        expect(screen.getByLabelText("Expected to close")).toHaveValue("2026-12-01");

        await userEvent.clear(screen.getByLabelText("Name"));
        await userEvent.type(screen.getByLabelText("Name"), "Acme 2027");
        await userEvent.clear(screen.getByLabelText("Amount"));
        await userEvent.clear(screen.getByLabelText("Currency"));
        await userEvent.type(screen.getByLabelText("Currency"), "gbp");
        await userEvent.selectOptions(screen.getByLabelText("Owner"), "");
        await userEvent.clear(screen.getByLabelText("Expected to close"));
        await userEvent.click(button("Save"));
        expect(await screen.findByText("Changed elsewhere.")).toBeInTheDocument();
        await userEvent.click(button("Save"));
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        expect(api.updateDeal.mock.lastCall[2]).toEqual({ name: "Acme 2027", amount: 0, currency: "GBP", pipelineUid: "p1", stageId: "st1", ownerUserUid: null, expectedCloseDate: null, version: 0 });

        await userEvent.selectOptions(screen.getByLabelText("Stage"), "lost");
        await userEvent.type(screen.getByLabelText("Why it was lost"), "Budget");
        await userEvent.type(screen.getByLabelText("Expected to close"), "2027-01-15");
        await userEvent.selectOptions(screen.getByLabelText("Owner"), "u2");
        await userEvent.click(button("Save"));
        await waitFor(() => expect(api.updateDeal.mock.lastCall[2]).toMatchObject({ stageId: "lost", lostReason: "Budget", ownerUserUid: "u2", expectedCloseDate: new Date("2027-01-15").toISOString() }));
        await userEvent.selectOptions(screen.getByLabelText("Pipeline"), "p2");
        expect(screen.getByLabelText("Stage")).toHaveValue("x1");

        await userEvent.click(button("Delete"));
        expect(api.deleteDeal).not.toHaveBeenCalled();
        await userEvent.click(button("Delete"));
        expect(await screen.findByText("Could not delete the deal.")).toBeInTheDocument();
        await userEvent.click(button("Delete"));
        await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("/crm/deals?w=w1"));
    });

    it("adds and removes the deal's contacts and company", async () => {
        api.getRecord.mockImplementation(async (type: string, _w: string, uid: string) => (type === "contact" ? contact({ uid }) : company({ uid })));
        api.searchRecords.mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce({ items: [contact({ uid: "c9", email: "new@x.example" })], total: 1 }).mockResolvedValue({ items: [company({ uid: "co9", name: "Globex" })], total: 1 });
        api.updateDeal.mockImplementation(async (_w: string, _u: string, input: any) => deal({ contactUids: ["c1"], companyUid: "co1", ...input }));
        await renderDetail(deal({ contactUids: ["c1"], companyUid: "co1" }));
        await userEvent.type(screen.getByLabelText("Find"), "new");
        await userEvent.click(button("Find"));
        await userEvent.click(button("Find"));
        await userEvent.click(await screen.findByRole("button", { name: "+ new@x.example" }));
        await waitFor(() => expect(api.updateDeal.mock.lastCall[2]).toMatchObject({ contactUids: ["c1", "c9"] }));
        await userEvent.selectOptions(screen.getByLabelText("Add a"), "company");
        await userEvent.click(button("Find"));
        await userEvent.click(await screen.findByRole("button", { name: "+ Globex" }));
        await waitFor(() => expect(api.updateDeal.mock.lastCall[2]).toMatchObject({ companyUid: "co9" }));
        await userEvent.click(await screen.findByRole("button", { name: "Remove ann@acme.example" }));
        await waitFor(() => expect(api.updateDeal.mock.lastCall[2]).toMatchObject({ contactUids: [] }));
        await userEvent.click(await screen.findByRole("button", { name: /^Remove Acme Inc$/ }));
        await waitFor(() => expect(api.updateDeal.mock.lastCall[2]).toMatchObject({ companyUid: null }));
    });

    it("shows won and lost deals, and viewers get no controls", async () => {
        api.listMembers.mockRejectedValue(new Error("x"));
        api.getRecord.mockRejectedValue(new Error("gone"));
        await renderDetail(deal({ status: "lost", stageId: "lost", lostReason: "Budget", companyUid: "gone" }), "viewer");
        expect(screen.getByText(/Lost - Budget/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
        await renderDetail(deal({ status: "won", stageId: "won", name: "Winner" }), "viewer");
        expect(screen.getByText(/· Won/)).toBeInTheDocument();
    });
});

describe("PipelineManager", () => {
    it("edits stages, sets the default, and creates and deletes pipelines", async () => {
        api.listPipelines.mockResolvedValue([pipeline(), pipeline({ uid: "p2", name: "Partners", isDefault: false })]);
        api.updatePipeline.mockRejectedValueOnce(new ApiRequestError("The stage still has 2 deals.", 400)).mockResolvedValue(pipeline());
        api.createPipeline.mockResolvedValue(pipeline());
        api.deletePipeline.mockResolvedValue(undefined);
        vi.spyOn(window, "prompt").mockReturnValueOnce(null).mockReturnValueOnce("  ").mockReturnValue("Upsell");
        vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
        inShell(<PipelineManager />);
        const sales = within(await screen.findByRole("region", { name: "Sales" }));
        expect(sales.getByText("Default")).toBeInTheDocument();
        await userEvent.clear(sales.getByLabelText("Pipeline name"));
        await userEvent.type(sales.getByLabelText("Pipeline name"), "Sales team");
        await userEvent.clear(sales.getByLabelText("Stage 1 name"));
        await userEvent.type(sales.getByLabelText("Stage 1 name"), "Lead");
        fireEvent.change(sales.getByLabelText("Stage 1 probability"), { target: { value: "5" } });
        fireEvent.change(sales.getByLabelText("Stage 1 rotting days"), { target: { value: "" } });
        fireEvent.change(sales.getByLabelText("Stage 2 rotting days"), { target: { value: "14" } });
        await userEvent.click(sales.getByRole("button", { name: "+ Add stage" }));
        await userEvent.selectOptions(sales.getByLabelText("Stage 5 kind"), "open");
        await userEvent.click(sales.getByRole("button", { name: "Move stage 5 up" }));
        await userEvent.click(sales.getByRole("button", { name: "Move stage 1 down" }));
        await userEvent.click(sales.getByRole("button", { name: "Remove stage 3" }));
        await userEvent.click(sales.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("The stage still has 2 deals.")).toBeInTheDocument();
        await userEvent.click(sales.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(api.updatePipeline).toHaveBeenCalledTimes(2));
        expect(api.updatePipeline.mock.lastCall[2]).toEqual({
            name: "Sales team",
            stages: [
                { id: "st2", name: "Proposal", probability: 60, kind: "open", rottingDays: 14 },
                { id: "st1", name: "Lead", probability: 5, kind: "open" },
                { name: "New stage", probability: 50, kind: "open" },
                { id: "lost", name: "Lost", probability: 0, kind: "lost" },
            ],
        });
        expect(sales.queryByRole("button", { name: "Delete pipeline" })).not.toBeInTheDocument();

        const partners = within(screen.getByRole("region", { name: "Partners" }));
        await userEvent.click(partners.getByRole("button", { name: "Make default" }));
        expect(api.updatePipeline).toHaveBeenLastCalledWith("w1", "p2", { isDefault: true });
        await userEvent.click(partners.getByRole("button", { name: "Delete pipeline" }));
        expect(api.deletePipeline).not.toHaveBeenCalled();
        await userEvent.click(partners.getByRole("button", { name: "Delete pipeline" }));
        expect(api.deletePipeline).toHaveBeenCalledWith("w1", "p2");

        await userEvent.click(button("+ New pipeline"));
        await userEvent.click(button("+ New pipeline"));
        expect(api.createPipeline).not.toHaveBeenCalled();
        await userEvent.click(button("+ New pipeline"));
        expect(api.createPipeline).toHaveBeenCalledWith("w1", { name: "Upsell" });
    });

    it("shows other members the pipelines only, and says when loading fails", async () => {
        api.listPipelines.mockRejectedValueOnce(new Error("x")).mockResolvedValue([pipeline({ isDefault: false })]);
        inShell(<PipelineManager />, "editor");
        expect(await screen.findByText("Could not load the pipelines.")).toBeInTheDocument();
        inShell(<PipelineManager />, "editor");
        await screen.findAllByRole("region", { name: "Sales" });
        expect(screen.queryByRole("button", { name: "Make default" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "+ New pipeline" })).not.toBeInTheDocument();
    });
});

describe("deals elsewhere", () => {
    it("lists a contact's deals on its page", async () => {
        api.getRecord.mockResolvedValue(contact());
        api.listDeals.mockResolvedValueOnce([deal()]).mockRejectedValue(new Error("x"));
        inShell(<RecordDetail objectType="contact" uid="c1" />);
        const section = within(await screen.findByRole("region", { name: "Deals" }));
        expect(await section.findByRole("link", { name: "Acme renewal" })).toHaveAttribute("href", "/crm/deals/d1?w=w1");
        expect(api.listDeals).toHaveBeenCalledWith("w1", { contactUid: "c1" });
        inShell(<RecordDetail objectType="contact" uid="c1" />);
        expect(await screen.findByText("No deals.")).toBeInTheDocument();
    });

    it("turns a sender's email logging on and off", async () => {
        api.listSenders.mockResolvedValue([{ uid: "s1", fromName: "Sales", fromAddress: "sales@acme.example", logEmail: false }]);
        api.updateSender.mockRejectedValueOnce(new ApiRequestError("Nope.", 400)).mockResolvedValue({});
        inShell(<WorkspaceSettings />);
        await userEvent.click(await screen.findByLabelText("Log email with contacts"));
        expect(await screen.findByText("Nope.")).toBeInTheDocument();
        await userEvent.click(screen.getByLabelText("Log email with contacts"));
        expect(api.updateSender).toHaveBeenLastCalledWith("w1", "s1", { logEmail: true });
    });

    it("starts automations from deals in a pipeline and stage", async () => {
        api.getAutomation.mockResolvedValue(automation());
        api.listAutomations.mockResolvedValue([]);
        api.listPipelines.mockResolvedValue([pipeline()]);
        api.updateAutomation.mockImplementation(async (_w: string, _u: string, input: any) => automation(input));
        inShell(<AutomationEditor uid="a1" />);
        await userEvent.click(await screen.findByRole("button", { name: "Step trigger" }));
        const settings = within(screen.getByRole("complementary", { name: "Step settings" }));
        await userEvent.selectOptions(settings.getByLabelText("When a contact"), "deal.stage_changed");
        expect(settings.queryByLabelText("Moved to")).not.toBeInTheDocument();
        await userEvent.selectOptions(settings.getByLabelText("Pipeline"), "p1");
        await userEvent.selectOptions(settings.getByLabelText("Moved to"), "st2");
        await userEvent.selectOptions(settings.getByLabelText("Pipeline"), "");
        await userEvent.selectOptions(settings.getByLabelText("Pipeline"), "p1");
        await userEvent.click(button("Save draft"));
        expect(api.updateAutomation.mock.lastCall[2].graph.nodes[0].config).toMatchObject({ event: "deal.stage_changed", pipelineUid: "p1" });
        api.listPipelines.mockResolvedValue([]);
        await userEvent.selectOptions(settings.getByLabelText("When a contact"), "deal.won");
    });
});
