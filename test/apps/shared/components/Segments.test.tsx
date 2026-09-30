// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Segments, lead scoring rules, and segments in contact lists and campaigns.
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@rapidmx/web-client/lib/util/api.js";
import { MockAppShell, campaign, list, mockCrmApi, scoringRule, segment, stubBasics, workspace } from "../../fixtures.js";
import * as crmApi from "../../../../apps/shared/crmApi.js";
import CrmShell from "../../../../apps/shared/components/CrmShell.js";
import SegmentManager from "../../../../apps/shared/components/SegmentManager.js";
import ScoringRules, { describeRule } from "../../../../apps/shared/components/ScoringRules.js";
import RecordList from "../../../../apps/shared/components/RecordList.js";
import CampaignPage from "../../../../apps/shared/components/campaigns/CampaignPage.js";
import { draftOf } from "../../../../apps/shared/components/FilterBuilder.js";
import CrmSegmentsPage from "../../../../apps/crm/segments/index.js";
import CrmScoringPage from "../../../../apps/crm/scoring/index.js";

vi.mock("../../../../apps/shared/crmApi.js", (importOriginal) => mockCrmApi(importOriginal));
vi.mock("@rapidmx/web-client/shared/components/layout/AppShell.js", () => ({ default: MockAppShell }));

const api: any = crmApi;
const button = (name: string | RegExp) => screen.getByRole("button", { name });

function inShell(ui: React.ReactElement, role: string = "owner") {
    api.listWorkspaces.mockResolvedValue([workspace({ role })]);
    return render(<CrmShell section="segments">{ui}</CrmShell>);
}

/** Adds a condition "Tags equals vip" in the open filter builder. */
async function addTagCondition(value: string = "vip") {
    await userEvent.click(button(/Add condition/));
    const rows = screen.getAllByLabelText(/^Field \d/);
    await userEvent.selectOptions(rows[rows.length - 1], "tags");
    const values = screen.getAllByLabelText(/^Value \d/);
    await userEvent.type(values[values.length - 1], value);
}

beforeEach(() => {
    stubBasics(api);
    window.localStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, search: "", pathname: "/crm/segments", assign: vi.fn() } });
});

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe("draftOf", () => {
    it("turns a filter back into a draft", () => {
        expect(draftOf(undefined)).toEqual({ match: "and", conditions: [] });
        expect(draftOf({ field: "score", op: "gt", value: 5 })).toEqual({ match: "and", conditions: [{ field: "score", op: "gt", value: "5" }] });
        expect(
            draftOf({
                or: [
                    { field: "lastEngagedAt", op: "gte", value: "2026-09-01T00:00:00.000Z" },
                    { field: "tags", op: "isSet" },
                    { and: [{ field: "x", op: "eq", value: 1 }] },
                ],
            }),
        ).toEqual({
            match: "or",
            conditions: [
                { field: "lastEngagedAt", op: "gte", value: "2026-09-01" },
                { field: "tags", op: "isSet", value: "" },
            ],
        });
        expect(draftOf({ and: undefined } as any)).toEqual({ match: "and", conditions: [] });
    });
});

describe("SegmentManager", () => {
    it("lists segments with their members, and refreshes and deletes them", async () => {
        api.listSegments.mockResolvedValue([segment({ description: "Big spenders" }), segment({ uid: "sg2", name: "Launch", kind: "static", capped: true, refreshedAt: null })]);
        api.refreshSegment.mockRejectedValueOnce(new Error("x")).mockResolvedValue(segment({ memberCount: 9 }));
        api.deleteSegment.mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
        vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
        inShell(<SegmentManager />);
        expect(await screen.findByText("Big spenders")).toBeInTheDocument();
        expect(screen.getByText("Static")).toBeInTheDocument();
        expect(screen.getByText("(limit reached)")).toBeInTheDocument();
        expect(within(screen.getByRole("table")).getAllByRole("link", { name: "Contacts" })[0]).toHaveAttribute("href", "/crm?segment=sg1&w=w1");

        await userEvent.click(screen.getAllByRole("button", { name: "Refresh" })[0]);
        expect(await screen.findByText("Could not refresh the segment.")).toBeInTheDocument();
        await userEvent.click(screen.getAllByRole("button", { name: "Refresh" })[0]);
        expect(await screen.findByText("9")).toBeInTheDocument();

        await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
        expect(api.deleteSegment).not.toHaveBeenCalled();
        await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
        expect(await screen.findByText("Could not delete the segment.")).toBeInTheDocument();
        await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
        await waitFor(() => expect(api.listSegments).toHaveBeenCalledTimes(2));
    });

    it("creates a segment, previewing who matches", async () => {
        api.listLists.mockResolvedValue([list()]);
        api.previewSegment
            .mockResolvedValueOnce({ count: 1, capped: false, contacts: [{ uid: "c1", email: "ann@x.example" }] })
            .mockRejectedValueOnce(new Error("x"))
            .mockResolvedValue({ count: 100000, capped: true, contacts: [] });
        api.createSegment.mockRejectedValueOnce(new ApiRequestError("Too many.", 400)).mockResolvedValue(segment());
        inShell(<SegmentManager />);
        await userEvent.click(await screen.findByRole("button", { name: "+ New segment" }));
        const dialog = within(screen.getByRole("dialog"));
        expect(dialog.getByRole("status")).toHaveTextContent("Add a condition to choose the contacts.");
        // A segment's filter can't name segments.
        await userEvent.click(dialog.getByRole("button", { name: /Add condition/ }));
        expect(within(dialog.getByLabelText("Field 1")).queryByRole("option", { name: "Segments" })).not.toBeInTheDocument();
        await userEvent.selectOptions(dialog.getByLabelText("Field 1"), "tags");
        await userEvent.type(dialog.getByLabelText("Value 1"), "v");
        expect(await dialog.findByText("1 contact matches now, such as ann@x.example.")).toBeInTheDocument();
        await userEvent.type(dialog.getByLabelText("Value 1"), "i");
        expect(await dialog.findByText("Counting…")).toBeInTheDocument();
        await userEvent.type(dialog.getByLabelText("Value 1"), "p");
        expect(await dialog.findByText("More than 100,000 contacts match now.")).toBeInTheDocument();
        await userEvent.type(dialog.getByLabelText("Name"), "VIPs");
        await userEvent.type(dialog.getByLabelText("Description"), "Best");
        await userEvent.click(dialog.getByLabelText(/Static/));
        await userEvent.click(dialog.getByRole("button", { name: "Create" }));
        expect(await screen.findByText("Too many.")).toBeInTheDocument();
        await userEvent.click(dialog.getByRole("button", { name: "Create" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(api.createSegment).toHaveBeenLastCalledWith("w1", { name: "VIPs", description: "Best", kind: "static", filter: { field: "tags", op: "eq", value: "vip" } });
    });

    it("edits a segment, and closes without saving", async () => {
        api.listSegments.mockResolvedValue([segment({ kind: "static" })]);
        api.listProperties.mockRejectedValue(new Error("x"));
        api.listLists.mockRejectedValue(new Error("x"));
        api.updateSegment.mockResolvedValue(segment());
        inShell(<SegmentManager />);
        await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
        const dialog = within(screen.getByRole("dialog"));
        expect(dialog.getByLabelText("Name")).toHaveValue("VIPs");
        await userEvent.click(dialog.getByLabelText(/Dynamic/));
        await userEvent.clear(dialog.getByLabelText("Description"));
        await userEvent.click(dialog.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(api.updateSegment).toHaveBeenCalledWith("w1", "sg1", { name: "VIPs", description: null, kind: "dynamic", filter: segment().filter }));
        await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
        await userEvent.click(button("Close"));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("shows viewers the segments only, says when loading fails, and is a page", async () => {
        api.listSegments.mockRejectedValueOnce(new Error("x"));
        inShell(<SegmentManager />, "viewer");
        expect(await screen.findByText("Could not load the segments.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "+ New segment" })).not.toBeInTheDocument();
        render(<CrmSegmentsPage {...({} as any)} />);
        expect(await screen.findByRole("heading", { name: "Segments" })).toBeInTheDocument();
    });
});

describe("ScoringRules", () => {
    it("describes rules", () => {
        expect(describeRule(scoringRule())).toBe("+20 when the contact matches the rule's conditions");
        expect(describeRule(scoringRule({ kind: "activity", activity: "opened", points: -5, withinDays: 30, maxPoints: 50 }))).toBe(
            "-5 each time: Opened an email (last 30 days, at most 50)",
        );
        expect(describeRule(scoringRule({ kind: "activity", activity: "mystery", points: 1 }))).toBe("+1 each time: mystery");
    });

    it("lists, switches, deletes and recalculates rules", async () => {
        api.listScoringRules.mockResolvedValue([scoringRule(), scoringRule({ uid: "r2", name: "Opens", kind: "activity", activity: "opened", points: 5, enabled: false })]);
        api.updateScoringRule.mockRejectedValueOnce(new Error("x")).mockResolvedValue(scoringRule());
        api.deleteScoringRule.mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
        api.recalculateScores.mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce({ changed: 1 }).mockResolvedValue({ changed: 4 });
        vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
        inShell(<ScoringRules />);
        expect(await screen.findByText("+5 each time: Opened an email")).toBeInTheDocument();

        await userEvent.click(screen.getAllByLabelText("On")[1]);
        expect(await screen.findByText("Could not change the rule.")).toBeInTheDocument();
        await userEvent.click(screen.getAllByLabelText("On")[1]);
        expect(api.updateScoringRule).toHaveBeenLastCalledWith("w1", "r2", { enabled: true });

        await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
        await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
        expect(await screen.findByText("Could not delete the rule.")).toBeInTheDocument();
        await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
        await waitFor(() => expect(api.deleteScoringRule).toHaveBeenCalledTimes(2));

        await userEvent.click(button("Recalculate now"));
        expect(await screen.findByText("Could not recalculate the scores.")).toBeInTheDocument();
        await userEvent.click(button("Recalculate now"));
        expect(await screen.findByText("Scores recalculated: 1 contact changed.")).toBeInTheDocument();
        await userEvent.click(button("Recalculate now"));
        expect(await screen.findByText("Scores recalculated: 4 contacts changed.")).toBeInTheDocument();
    });

    it("creates property and activity rules, and edits one", async () => {
        api.listScoringRules.mockResolvedValue([scoringRule({ kind: "activity", activity: "clicked", points: 3, maxPoints: 30, withinDays: 7 })]);
        api.createScoringRule.mockRejectedValueOnce(new ApiRequestError("Too many rules.", 400)).mockResolvedValue(scoringRule());
        api.updateScoringRule.mockResolvedValue(scoringRule());
        inShell(<ScoringRules />);
        await userEvent.click(await screen.findByRole("button", { name: "+ New rule" }));
        let dialog = within(screen.getByRole("dialog"));
        await userEvent.type(dialog.getByLabelText("Name"), "VIP");
        expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled();
        await addTagCondition();
        await userEvent.clear(dialog.getByLabelText("Points (negative takes away)"));
        await userEvent.type(dialog.getByLabelText("Points (negative takes away)"), "20");
        await userEvent.click(dialog.getByRole("button", { name: "Create" }));
        expect(await screen.findByText("Too many rules.")).toBeInTheDocument();
        await userEvent.click(dialog.getByRole("button", { name: "Create" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(api.createScoringRule).toHaveBeenLastCalledWith("w1", { name: "VIP", points: 20, filter: { field: "tags", op: "eq", value: "vip" }, kind: "property" });

        await userEvent.click(button("+ New rule"));
        dialog = within(screen.getByRole("dialog"));
        await userEvent.type(dialog.getByLabelText("Name"), "Forms");
        await userEvent.click(dialog.getByLabelText("By what they do"));
        await userEvent.click(dialog.getByLabelText("By who they are"));
        await userEvent.click(dialog.getByLabelText("By what they do"));
        await userEvent.selectOptions(dialog.getByLabelText("Each time the contact"), "form_submitted");
        await userEvent.type(dialog.getByLabelText("In the last (days, empty: ever)"), "30");
        await userEvent.type(dialog.getByLabelText("At most (points, empty: no limit)"), "50");
        await userEvent.click(dialog.getByRole("button", { name: "Create" }));
        await waitFor(() =>
            expect(api.createScoringRule).toHaveBeenLastCalledWith("w1", { name: "Forms", points: 10, activity: "form_submitted", maxPoints: 50, withinDays: 30, kind: "activity" }),
        );

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        await userEvent.click(button("Edit"));
        dialog = within(screen.getByRole("dialog"));
        expect(dialog.queryByLabelText("By what they do")).not.toBeInTheDocument();
        await userEvent.clear(dialog.getByLabelText("In the last (days, empty: ever)"));
        await userEvent.clear(dialog.getByLabelText("At most (points, empty: no limit)"));
        await userEvent.click(dialog.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(api.updateScoringRule).toHaveBeenLastCalledWith("w1", "r1", { name: "VIP", points: 3, activity: "clicked", maxPoints: null, withinDays: null }));
        await userEvent.click(button("Edit"));
        await userEvent.click(button("Close"));
    });

    it("shows other members the rules only, says when loading fails, and is a page", async () => {
        api.listScoringRules.mockRejectedValueOnce(new Error("x"));
        inShell(<ScoringRules />, "editor");
        expect(await screen.findByText("Could not load the scoring rules.")).toBeInTheDocument();
        expect(screen.getByText("No scoring rules yet.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "+ New rule" })).not.toBeInTheDocument();
        render(<CrmScoringPage {...({} as any)} />);
        expect(await screen.findByRole("heading", { name: "Lead scoring" })).toBeInTheDocument();
    });
});

describe("segments elsewhere", () => {
    it("opens a segment's members from ?segment=, and offers segments as a filter field", async () => {
        Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, search: "?segment=sg1", pathname: "/crm", assign: vi.fn() } });
        api.listSegments.mockResolvedValue([segment()]);
        inShell(<RecordList objectType="contact" />);
        await waitFor(() =>
            expect(api.searchRecords).toHaveBeenLastCalledWith("contact", "w1", expect.objectContaining({ filter: { field: "segments", op: "eq", value: "sg1" } })),
        );
        api.listSegments.mockRejectedValue(new Error("x"));
        inShell(<RecordList objectType="contact" />);
    });

    it("aims a draft campaign at segments", async () => {
        api.listSegments.mockResolvedValue([segment(), segment({ uid: "sg2", name: "Churned" })]);
        api.listLists.mockResolvedValue([list()]);
        api.getCampaign.mockResolvedValue(campaign({ listUids: ["l1"] }));
        api.updateCampaign.mockImplementation(async (_w: string, _u: string, input: any) => campaign(input));
        inShell(<CampaignPage uid="cp1" />);
        await userEvent.click(within(await screen.findByRole("group", { name: "Only those in the segments" })).getByLabelText("VIPs"));
        await userEvent.click(within(screen.getByRole("group", { name: "Never those in the segments" })).getByLabelText("Churned"));
        await waitFor(() =>
            expect(api.campaignAudience).toHaveBeenLastCalledWith("w1", { listUids: ["l1"], excludeListUids: [], segmentUids: ["sg1"], excludeSegmentUids: ["sg2"] }),
        );
        await userEvent.click(button("Save draft"));
        expect(api.updateCampaign.mock.lastCall[2]).toMatchObject({ segmentUids: ["sg1"], excludeSegmentUids: ["sg2"] });
        api.listSegments.mockRejectedValue(new Error("x"));
        inShell(<CampaignPage uid="cp1" />);
        await waitFor(() => expect(api.listSegments).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.getAllByLabelText("Campaign name")).toHaveLength(2));
    });
});
