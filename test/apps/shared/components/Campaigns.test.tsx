// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// The campaign list, the draft editor and the report.
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@rapidmx/web-client/lib/util/api.js";
import { MockAppShell, campaign, counts, emailTemplate, list, mockCrmApi, stubBasics, workspace } from "../../fixtures.js";
import * as crmApi from "../../../../apps/shared/crmApi.js";
import CrmShell from "../../../../apps/shared/components/CrmShell.js";
import CampaignList from "../../../../apps/shared/components/campaigns/CampaignList.js";
import CampaignPage from "../../../../apps/shared/components/campaigns/CampaignPage.js";
import { REFRESH_MS } from "../../../../apps/shared/components/campaigns/CampaignReport.js";
import { percent, when } from "../../../../apps/shared/components/campaigns/campaignUi.js";
import CrmCampaignsPage from "../../../../apps/crm/campaigns/index.js";
import CrmCampaignPage from "../../../../apps/crm/campaigns/[uid].js";

vi.mock("../../../../apps/shared/crmApi.js", (importOriginal) => mockCrmApi(importOriginal));
vi.mock("@rapidmx/web-client/shared/components/layout/AppShell.js", () => ({ default: MockAppShell }));

const api: any = crmApi;
const sender = { uid: "s1", fromName: "Acme News", fromAddress: "news@acme.example" };
const button = (name: string | RegExp) => screen.getByRole("button", { name });

function inShell(ui: React.ReactElement, role: string = "owner") {
    api.listWorkspaces.mockResolvedValue([workspace({ role })]);
    return render(<CrmShell section="campaigns">{ui}</CrmShell>);
}

beforeEach(() => {
    stubBasics(api);
    api.listSenders.mockResolvedValue([sender]);
    api.listLists.mockResolvedValue([list(), list({ uid: "l2", name: "VIP" })]);
    api.searchTemplates.mockResolvedValue({ items: [emailTemplate()], total: 1 });
    window.localStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, search: "", pathname: "/crm/campaigns", assign: vi.fn() } });
});

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("campaign helpers", () => {
    it("formats rates and times", () => {
        expect(percent(1, 3)).toBe("33.3%");
        expect(percent(1, 0)).toBe("–");
        expect(when(null)).toBe("–");
        expect(when("2026-09-30T10:00:00.000Z")).toBe(new Date("2026-09-30T10:00:00.000Z").toLocaleString());
    });
});

describe("CampaignList", () => {
    it("lists campaigns with their state and results, and loads more", async () => {
        api.searchCampaigns
            .mockResolvedValueOnce({
                items: [
                    campaign({ status: "sent", finishedAt: "2026-09-30T10:00:00.000Z", recipientCount: 10, stats: counts({ sent: 10, opened: 5, clicked: 2 }), abTest: { variants: [] } }),
                    campaign({ uid: "cp2", name: "Weekly", status: "sending" }),
                ],
                total: 3,
            })
            .mockResolvedValueOnce({ items: [campaign(), campaign({ uid: "cp2", name: "Weekly", status: "sending" })], total: 3 })
            .mockResolvedValueOnce({ items: [campaign({ uid: "cp3", name: "Old", status: "failed" })], total: 3 });
        inShell(<CampaignList />);
        expect(await screen.findByText("Weekly")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Launch" })).toHaveAttribute("href", "/crm/campaigns/cp1?w=w1");
        expect(screen.getByText("A/B")).toBeInTheDocument();
        expect(screen.getByText("50.0%")).toBeInTheDocument();
        expect(screen.getByText("Sending")).toBeInTheDocument();
        // A campaign going out can't be deleted from here.
        expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
        await userEvent.click(button("Show more"));
        expect(await screen.findByText("Old")).toBeInTheDocument();
        expect(screen.getByText("Failed")).toBeInTheDocument();
    });

    it("creates, duplicates and deletes campaigns", async () => {
        api.searchCampaigns.mockResolvedValue({ items: [campaign()], total: 1 });
        api.createCampaign.mockRejectedValueOnce(new ApiRequestError("Too many.", 400)).mockResolvedValue(campaign({ uid: "new" }));
        api.duplicateCampaign.mockRejectedValueOnce(new Error("x")).mockResolvedValue(campaign({ uid: "copy" }));
        api.deleteCampaign.mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
        vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
        inShell(<CampaignList />);
        await screen.findByText("Launch");

        await userEvent.click(button("+ New campaign"));
        await userEvent.type(screen.getByLabelText("Name"), "Spring");
        await userEvent.click(button("Create"));
        expect(await screen.findByText("Too many.")).toBeInTheDocument();
        await userEvent.click(button("Create"));
        await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("/crm/campaigns/new?w=w1"));
        await userEvent.click(button("Close"));

        await userEvent.click(button("Duplicate"));
        expect(await screen.findByText("Could not duplicate the campaign.")).toBeInTheDocument();
        await userEvent.click(button("Duplicate"));
        await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("/crm/campaigns/copy?w=w1"));

        await userEvent.click(button("Delete"));
        expect(api.deleteCampaign).not.toHaveBeenCalled();
        await userEvent.click(button("Delete"));
        expect(await screen.findByText("Could not delete the campaign.")).toBeInTheDocument();
        await userEvent.click(button("Delete"));
        await waitFor(() => expect(api.searchCampaigns).toHaveBeenCalledTimes(2));
    });

    it("shows viewers the list only, and says when loading fails", async () => {
        api.searchCampaigns.mockRejectedValueOnce(new Error("x"));
        inShell(<CampaignList />, "viewer");
        expect(await screen.findByText("Could not load the campaigns.")).toBeInTheDocument();
        expect(screen.getByText("No campaigns yet.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "+ New campaign" })).not.toBeInTheDocument();
    });

    it("is the campaigns page, with a page for one campaign", async () => {
        const { unmount } = render(<CrmCampaignsPage {...({} as any)} />);
        expect(await screen.findByRole("heading", { name: "Campaigns" })).toBeInTheDocument();
        unmount();
        api.getCampaign.mockResolvedValue(campaign());
        render(<CrmCampaignPage {...({ params: { uid: "cp1" } } as any)} />);
        expect(await screen.findByDisplayValue("Launch")).toBeInTheDocument();
    });
});

describe("CampaignEditor", () => {
    async function renderEditor(value: any = campaign(), role: string = "owner") {
        api.getCampaign.mockResolvedValue(value);
        inShell(<CampaignPage uid="cp1" />, role);
        await screen.findByLabelText("Campaign name");
    }

    it("says when the campaign can't be loaded, and gets by without lists, senders or templates", async () => {
        api.getCampaign.mockRejectedValueOnce(new ApiRequestError("Not found.", 404));
        inShell(<CampaignPage uid="cp1" />);
        expect(await screen.findByText("Not found.")).toBeInTheDocument();
        api.listLists.mockRejectedValue(new Error("x"));
        api.listSenders.mockRejectedValue(new Error("x"));
        api.searchTemplates.mockRejectedValue(new Error("x"));
        api.campaignChecklist.mockRejectedValue(new Error("x"));
        await renderEditor();
        expect(screen.getAllByText("The workspace has no lists yet.")).toHaveLength(2);
    });

    it("edits the draft, counting its audience, and saves it", async () => {
        api.campaignChecklist.mockResolvedValueOnce([{ field: "listUids", message: "Choose at least one list to send to." }]).mockResolvedValue([]);
        api.campaignAudience.mockResolvedValueOnce({ count: 1, capped: false }).mockRejectedValueOnce(new Error("x")).mockResolvedValue({ count: 100000, capped: true });
        api.updateCampaign.mockRejectedValueOnce(new ApiRequestError("Changed elsewhere.", 409)).mockImplementation(async (_w: string, _u: string, input: any) => campaign({ ...input, version: 1 }));
        await renderEditor();
        expect(await screen.findByText("Choose at least one list to send to.")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Reaches 0 contacts right now.");

        await userEvent.clear(screen.getByLabelText("Campaign name"));
        await userEvent.type(screen.getByLabelText("Campaign name"), "Spring");
        await userEvent.selectOptions(screen.getByLabelText("Sender"), "s1");
        await userEvent.click(within(screen.getByRole("group", { name: "Send to the subscribers of" })).getByLabelText("Newsletter"));
        await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Reaches 1 contact right now."));
        await userEvent.click(within(screen.getByRole("group", { name: "But not to the subscribers of" })).getByLabelText("VIP"));
        await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Couldn't count who this reaches."));
        await userEvent.click(within(screen.getByRole("group", { name: "But not to the subscribers of" })).getByLabelText("VIP"));
        await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Reaches more than 100,000 contacts right now."));
        await userEvent.selectOptions(screen.getByLabelText("Template"), "t1");
        await userEvent.click(screen.getByLabelText("Track opens (an invisible image)"));
        await userEvent.click(screen.getByLabelText("Track clicks (links go through a redirect)"));

        await userEvent.click(button("Save draft"));
        expect(await screen.findByText("Changed elsewhere.")).toBeInTheDocument();
        await userEvent.click(button("Save draft"));
        await waitFor(() => expect(button("Save draft")).toBeDisabled());
        expect(api.updateCampaign).toHaveBeenLastCalledWith("w1", "cp1", {
            name: "Spring",
            senderUid: "s1",
            templateUid: "t1",
            listUids: ["l1"],
            excludeListUids: [],
            trackOpens: false,
            trackClicks: false,
            abTest: null,
            version: 0,
        });
        expect(await screen.findByText("Ready to send.")).toBeInTheDocument();
    });

    it("sets up an A/B test", async () => {
        api.updateCampaign.mockImplementation(async (_w: string, _u: string, input: any) => campaign({ ...input }));
        await renderEditor(campaign({ templateUid: "t1" }));
        await userEvent.click(screen.getByLabelText(/Test versions on part of the audience/));
        await userEvent.type(screen.getByLabelText("Subject of variant A"), "Hello");
        await userEvent.type(screen.getByLabelText("Subject of variant B"), "Hi");
        await userEvent.clear(screen.getByLabelText("Subject of variant B"));
        await userEvent.selectOptions(screen.getByLabelText("Template of variant B"), "t1");
        await userEvent.selectOptions(screen.getByLabelText("Template of variant B"), "");
        await userEvent.click(button("+ Add variant"));
        await userEvent.click(button("+ Add variant"));
        expect(screen.queryByRole("button", { name: "+ Add variant" })).not.toBeInTheDocument();
        await userEvent.selectOptions(screen.getByLabelText("Template of variant D"), "t1");
        await userEvent.click(button("Remove variant B"));
        expect(screen.getByLabelText("Template of variant C")).toHaveValue("t1");
        fireEvent.change(screen.getByLabelText("Test on (% of the audience)"), { target: { value: "30" } });
        await userEvent.selectOptions(screen.getByLabelText("Pick the winner by"), "click");
        fireEvent.change(screen.getByLabelText("After (hours)"), { target: { value: "6" } });
        await userEvent.click(button("Save draft"));
        expect(api.updateCampaign.mock.lastCall[2].abTest).toEqual({
            variants: [
                { id: "A", subject: "Hello" },
                { id: "B" },
                { id: "C", templateUid: "t1" },
            ],
            testPercent: 30,
            metric: "click",
            testHours: 6,
        });
        await userEvent.click(button("Remove variant C"));
        expect(screen.queryByRole("button", { name: /Remove variant/ })).not.toBeInTheDocument();
        await userEvent.click(screen.getByLabelText(/Test versions on part of the audience/));
        expect(screen.queryByLabelText("Subject of variant A")).not.toBeInTheDocument();
    });

    it("previews and test-sends the chosen email", async () => {
        api.getTemplate.mockRejectedValueOnce(new Error("x")).mockResolvedValue(emailTemplate({ preheader: "Peek" }));
        api.renderTemplate.mockResolvedValue({ subject: "Hi Jane", html: "<p>Jane</p>", text: "Jane" });
        api.sendTestTemplate.mockResolvedValue({ sent: "me@acme.example" });
        await renderEditor(campaign({ templateUid: "t1" }));
        expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/crm/templates/t1?w=w1");
        await userEvent.click(button("Preview"));
        expect(await screen.findByText("Could not load the template.")).toBeInTheDocument();
        await userEvent.click(button("Preview"));
        expect(await screen.findByText("Hi Jane")).toBeInTheDocument();
        expect(api.renderTemplate.mock.lastCall[1].preheader).toBe("Peek");
        await userEvent.click(button("Close"));
        api.getTemplate.mockResolvedValue(emailTemplate());
        await userEvent.click(button("Preview"));
        await screen.findByText("Hi Jane");
        await userEvent.click(button("Close"));
        await userEvent.click(button("Send test"));
        const dialog = within(screen.getByRole("dialog"));
        await userEvent.type(dialog.getByLabelText("To"), "me@acme.example");
        await userEvent.click(dialog.getByRole("button", { name: "Send test" }));
        expect(await screen.findByText("Sent to me@acme.example.")).toBeInTheDocument();
        expect(api.sendTestTemplate).toHaveBeenLastCalledWith("w1", "t1", { to: "me@acme.example", senderUid: "s1" });
        await userEvent.click(button("Close"));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("sends now or schedules, saving first, and asks before sending", async () => {
        const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
        api.updateCampaign.mockRejectedValueOnce(new Error("x")).mockImplementation(async (_w: string, _u: string, input: any) => campaign({ ...input }));
        api.scheduleCampaign.mockRejectedValueOnce(new ApiRequestError("Add your postal address.", 400)).mockResolvedValue(campaign({ status: "scheduled", scheduledAt: "2026-10-01T09:00:00.000Z" }));
        await renderEditor();
        await userEvent.type(screen.getByLabelText("Campaign name"), "!");
        await userEvent.click(button("Send now"));
        expect(await screen.findByText("Could not save the campaign.")).toBeInTheDocument();
        await userEvent.click(button("Send now"));
        expect(confirm).toHaveBeenLastCalledWith('Send "Launch!" now?');
        expect(api.scheduleCampaign).not.toHaveBeenCalled();
        await userEvent.click(button("Send now"));
        expect(await screen.findByText("Add your postal address.")).toBeInTheDocument();
        expect(api.scheduleCampaign).toHaveBeenLastCalledWith("w1", "cp1", undefined);

        fireEvent.change(screen.getByLabelText("When (empty: now)"), { target: { value: "2026-10-01T09:00" } });
        await userEvent.click(button("Schedule"));
        expect(api.scheduleCampaign).toHaveBeenLastCalledWith("w1", "cp1", new Date("2026-10-01T09:00").toISOString());
        expect(await screen.findByText(/Goes out/)).toBeInTheDocument();
        expect(screen.getByText("Scheduled")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    });

    it("takes a scheduled campaign back to a draft", async () => {
        api.changeCampaign.mockRejectedValueOnce(new Error("x")).mockResolvedValue(campaign());
        await renderEditor(campaign({ status: "scheduled", scheduledAt: "2026-10-01T09:00:00.000Z" }));
        expect(screen.getByLabelText("Campaign name")).toHaveAttribute("readonly");
        await userEvent.click(button("Back to draft"));
        expect(await screen.findByText("Could not take the campaign back.")).toBeInTheDocument();
        await userEvent.click(button("Back to draft"));
        expect(await screen.findByRole("button", { name: "Send now" })).toBeInTheDocument();
        expect(api.changeCampaign).toHaveBeenLastCalledWith("w1", "cp1", "unschedule");
    });

    it("shows viewers the draft without anything to change", async () => {
        await renderEditor(campaign({ templateUid: "t1" }), "viewer");
        expect(screen.queryByRole("button", { name: "Send now" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Send test" })).not.toBeInTheDocument();
        await renderEditor(campaign({ status: "scheduled" }), "viewer");
        expect(screen.queryByRole("button", { name: "Back to draft" })).not.toBeInTheDocument();
    });
});

describe("CampaignReport", () => {
    const sending = campaign({ status: "sending", startedAt: "2026-09-30T09:00:00.000Z", recipientCount: 3 });
    const report = (overrides: Record<string, unknown> = {}, stats: any = counts({ recipients: 3, sent: 2, opened: 1, clicked: 1, suppressed: 1, failed: 1 })) => ({
        campaign: { ...sending, ...overrides },
        stats,
        links: [{ url: "https://acme.example", clicks: 3, uniqueClicks: 1 }],
    });

    async function renderReport(value: any, role: string = "owner") {
        api.getCampaign.mockResolvedValue(value);
        inShell(<CampaignPage uid="cp1" />, role);
        await screen.findByRole("heading", { name: value.name });
    }

    it("shows the numbers and links, reloading while it goes out, and pauses, resumes and cancels", async () => {
        const intervals: (() => void)[] = [];
        const setIntervalSpy = vi.spyOn(window, "setInterval").mockImplementation(((handler: () => void, delay: number) => {
            if (delay === REFRESH_MS) {
                intervals.push(handler);
            }
            return 1;
        }) as any);
        // The server's report follows each change.
        let latest: any = sending;
        api.campaignReport.mockImplementation(async () => report(latest));
        const changed = (value: any) => async () => (latest = value);
        api.changeCampaign
            .mockRejectedValueOnce(new Error("x"))
            .mockImplementationOnce(changed({ ...sending, status: "paused" }))
            .mockImplementationOnce(changed({ ...sending, status: "sending" }))
            .mockImplementation(changed({ ...sending, status: "cancelled", finishedAt: "2026-09-30T10:00:00.000Z" }));
        vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
        await renderReport(sending);
        expect(await screen.findByText("https://acme.example")).toBeInTheDocument();
        expect(screen.getByText("1 skipped")).toBeInTheDocument();
        expect(screen.getByText("1 failed")).toBeInTheDocument();
        expect(screen.getAllByText("50.0%")).toHaveLength(2);
        expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), REFRESH_MS);
        await act(async () => intervals[0]());
        expect(api.campaignReport).toHaveBeenCalledTimes(2);

        await userEvent.click(button("Pause"));
        expect(await screen.findByText("Could not change the campaign.")).toBeInTheDocument();
        await userEvent.click(button("Pause"));
        expect(await screen.findByRole("button", { name: "Resume" })).toBeInTheDocument();
        await userEvent.click(button("Resume"));
        expect(await screen.findByRole("button", { name: "Pause" })).toBeInTheDocument();
        await userEvent.click(button("Cancel"));
        expect(api.changeCampaign).toHaveBeenCalledTimes(3);
        await userEvent.click(button("Cancel"));
        expect(await screen.findByText("Cancelled")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
        expect(screen.getByText(/finished/)).toBeInTheDocument();
    });

    it("follows the campaign to its next state, and says when the report can't load", async () => {
        api.campaignReport.mockResolvedValueOnce(report({ status: "sent", error: "Something went wrong." })).mockRejectedValue(new Error("x"));
        await renderReport(campaign({ status: "preparing", error: "Something went wrong." }));
        expect(await screen.findByText("Sent", { selector: "span" })).toBeInTheDocument();
        expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
        expect(await screen.findByText("Could not load the campaign's results.")).toBeInTheDocument();
    });

    it("compares A/B variants and names the winner", async () => {
        const abTest = { variants: [{ id: "A", subject: "Hello" }, { id: "B" }], testPercent: 20, metric: "open", testHours: 4 };
        const stats = { ...counts({ sent: 4 }), variants: { A: counts({ sent: 2, opened: 1 }) } };
        api.campaignReport.mockResolvedValue(report({ status: "sent", abTest }, stats));
        await renderReport(campaign({ status: "sent", abTest }));
        expect(await screen.findByText(/20% of the audience gets a variant/)).toBeInTheDocument();
        expect(screen.getByText("Hello")).toBeInTheDocument();
        expect(screen.getByText("The template's")).toBeInTheDocument();
        api.campaignReport.mockResolvedValue(report({ status: "sent", abTest: { ...abTest, winnerId: "B" } }, stats));
        await renderReport(campaign({ status: "sent", name: "Won", abTest: { ...abTest, winnerId: "B" } }));
        expect(await screen.findByText("Variant B won by opens and went to the rest of the audience.")).toBeInTheDocument();
        expect(screen.getByText("winner")).toBeInTheDocument();
    });

    it("duplicates the campaign, and hides the controls from viewers", async () => {
        api.campaignReport.mockResolvedValue(report({ status: "sent" }));
        api.duplicateCampaign.mockRejectedValueOnce(new Error("x")).mockResolvedValue(campaign({ uid: "copy" }));
        await renderReport(campaign({ status: "sent" }));
        await userEvent.click(button("Duplicate"));
        expect(await screen.findByText("Could not duplicate the campaign.")).toBeInTheDocument();
        await userEvent.click(button("Duplicate"));
        await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("/crm/campaigns/copy?w=w1"));
        await renderReport(campaign({ status: "paused", name: "Viewed" }), "viewer");
        expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
    });

    it("lists the recipients with filters and pages", async () => {
        api.campaignReport.mockResolvedValue({ ...report({ status: "sent" }), links: [] });
        const item = (overrides: Record<string, unknown>) => ({ uid: "r", contactUid: "c1", email: "ann@x.example", variantId: "A", status: "sent", openCount: 0, clickCount: 0, ...overrides });
        api.campaignRecipients
            .mockResolvedValueOnce({
                items: [
                    item({ uid: "r1", firstOpenedAt: "x", openCount: 2, firstClickedAt: "x", clickCount: 1, repliedAt: "x", sentAt: "2026-09-30T09:00:00.000Z" }),
                    item({ uid: "r2", bouncedAt: "x", bounceType: "hard" }),
                    item({ uid: "r3", complainedAt: "x" }),
                    item({ uid: "r4", unsubscribedAt: "x" }),
                    item({ uid: "r5", status: "failed", error: "No such user" }),
                    item({ uid: "r6", status: "queued" }),
                ],
                total: 120,
            })
            .mockResolvedValue({ items: [], total: 120 });
        await renderReport(campaign({ status: "sent", abTest: { variants: [{ id: "A" }, { id: "B" }], testPercent: 20, metric: "open", testHours: 4 } }));
        expect(await screen.findByText("Bounced (hard)")).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: "ann@x.example" })[0]).toHaveAttribute("href", "/crm/contacts/c1?w=w1");
        expect(screen.getByText("Complained", { selector: "td" })).toBeInTheDocument();
        expect(screen.getByText("Unsubscribed", { selector: "td" })).toBeInTheDocument();
        expect(screen.getByText("No such user")).toBeInTheDocument();
        expect(screen.getByText("Yes")).toBeInTheDocument();
        expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
        await userEvent.click(button("Next"));
        expect(await screen.findByText("No recipients match.")).toBeInTheDocument();
        expect(api.campaignRecipients).toHaveBeenLastCalledWith("w1", "cp1", { status: undefined, engagement: undefined, q: undefined, page: 1, limit: 50 });
        await userEvent.click(button("Previous"));
        await userEvent.selectOptions(screen.getByLabelText("Status"), "failed");
        await userEvent.selectOptions(screen.getByLabelText("What happened"), "bounced");
        await userEvent.type(screen.getByLabelText("Find an address"), "ann");
        await waitFor(() => expect(api.campaignRecipients).toHaveBeenLastCalledWith("w1", "cp1", { status: "failed", engagement: "bounced", q: "ann", page: 0, limit: 50 }));
        api.campaignRecipients.mockRejectedValueOnce(new Error("x"));
        await userEvent.type(screen.getByLabelText("Find an address"), "e");
        expect(await screen.findByText("Could not load the recipients.")).toBeInTheDocument();
        expect(REFRESH_MS).toBe(10_000);
    });
});
