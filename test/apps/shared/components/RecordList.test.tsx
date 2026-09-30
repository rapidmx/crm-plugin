// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@rapidmx/web-client/lib/util/api.js";
import { MockAppShell, company, contact, mockCrmApi, property, stubBasics, workspace } from "../../fixtures.js";
import * as crmApi from "../../../../apps/shared/crmApi.js";
import CrmShell from "../../../../apps/shared/components/CrmShell.js";
import RecordList, { PAGE_SIZE, recordName } from "../../../../apps/shared/components/RecordList.js";
import FilterBuilder, { EMPTY_FILTER, buildFilter } from "../../../../apps/shared/components/FilterBuilder.js";
import { COMPANY_FIELDS, fieldValue, formatValue, recordFields } from "../../../../apps/shared/fields.js";

vi.mock("../../../../apps/shared/crmApi.js", (importOriginal) => mockCrmApi(importOriginal));
vi.mock("@rapidmx/web-client/shared/components/layout/AppShell.js", () => ({ default: MockAppShell }));

const api: any = crmApi;

function renderList(objectType: "contact" | "company" = "contact") {
    return render(
        <CrmShell section={objectType === "contact" ? "contacts" : "companies"}>
            <RecordList objectType={objectType} />
        </CrmShell>,
    );
}

beforeEach(() => {
    stubBasics(api);
    window.localStorage.clear();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("RecordList", () => {
    it("lists records with links, formats their values, and sorts, searches and pages", async () => {
        api.listProperties.mockResolvedValue([property()]);
        api.searchRecords.mockResolvedValue({ items: [contact(), contact({ uid: "c2", email: "bob@x.example", firstName: undefined, lastName: undefined, lifecycleStage: "customer", tags: [] })], total: 120 });
        renderList();

        const link = await screen.findByRole("link", { name: "ann@acme.example" });
        expect(link).toHaveAttribute("href", "/crm/contacts/c1?w=w1");
        expect(screen.getByRole("heading", { name: "Contacts (120)" })).toBeInTheDocument();
        expect(screen.getByText("Lead")).toBeInTheDocument();
        expect(api.searchRecords).toHaveBeenLastCalledWith("contact", "w1", { sort: { field: "dateCreated", direction: "desc" }, limit: PAGE_SIZE, page: 0 });

        await userEvent.click(screen.getByRole("button", { name: "Score" }));
        await waitFor(() => expect(api.searchRecords).toHaveBeenLastCalledWith("contact", "w1", expect.objectContaining({ sort: { field: "score", direction: "asc" } })));
        await userEvent.click(screen.getByRole("button", { name: /Score/ }));
        await waitFor(() => expect(api.searchRecords).toHaveBeenLastCalledWith("contact", "w1", expect.objectContaining({ sort: { field: "score", direction: "desc" } })));
        expect(screen.getByRole("button", { name: "Score ▼" })).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Next →" }));
        await waitFor(() => expect(api.searchRecords).toHaveBeenLastCalledWith("contact", "w1", expect.objectContaining({ page: 1 })));
        expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "← Previous" }));
        await waitFor(() => expect(api.searchRecords).toHaveBeenLastCalledWith("contact", "w1", expect.objectContaining({ page: 0 })));

        await userEvent.type(screen.getByLabelText("Search"), "ann");
        await waitFor(() => expect(api.searchRecords).toHaveBeenLastCalledWith("contact", "w1", expect.objectContaining({ q: "ann" })));
    });

    it("filters with the filter builder", async () => {
        api.listProperties.mockResolvedValue([property(), property({ uid: "p2", key: "seats", label: "Seats", type: "number", options: [] })]);
        renderList();
        await screen.findByText("No contacts match.");

        await userEvent.click(screen.getByRole("button", { name: "Filters" }));
        await userEvent.click(screen.getByRole("button", { name: "+ Add condition" }));
        await userEvent.type(screen.getByLabelText("Value 1"), "acme");
        await waitFor(() =>
            expect(api.searchRecords).toHaveBeenLastCalledWith("contact", "w1", expect.objectContaining({ filter: { field: "email", op: "contains", value: "acme" } })),
        );

        await userEvent.click(screen.getByRole("button", { name: "+ Add condition" }));
        await userEvent.selectOptions(screen.getByLabelText("Field 2"), "properties.plan");
        await userEvent.selectOptions(screen.getByLabelText("Value 2"), "pro");
        await userEvent.selectOptions(screen.getByLabelText("Match"), "or");
        await waitFor(() =>
            expect(api.searchRecords).toHaveBeenLastCalledWith(
                "contact",
                "w1",
                expect.objectContaining({
                    filter: {
                        or: [
                            { field: "email", op: "contains", value: "acme" },
                            { field: "properties.plan", op: "eq", value: "pro" },
                        ],
                    },
                }),
            ),
        );
        expect(screen.getByRole("button", { name: "Hide filters" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Remove condition 1" }));
        await userEvent.selectOptions(screen.getByLabelText("Comparison 1"), "isSet");
        await waitFor(() =>
            expect(api.searchRecords).toHaveBeenLastCalledWith("contact", "w1", expect.objectContaining({ filter: { field: "properties.plan", op: "isSet" } })),
        );
        await userEvent.click(screen.getByRole("button", { name: "Hide filters" }));
        expect(screen.getByRole("button", { name: "Filters (1)" })).toBeInTheDocument();
    });

    it("tags, untags and deletes the selected records", async () => {
        api.searchRecords.mockResolvedValue({ items: [contact(), contact({ uid: "c2", email: "bob@x.example", firstName: "Bob", lastName: "Baker" })], total: 2 });
        api.bulkRecords.mockResolvedValue({ changed: 2 });
        const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
        renderList();

        await userEvent.click(await screen.findByLabelText("Select all on this page"));
        const toolbar = screen.getByRole("toolbar", { name: "Selected records" });
        expect(within(toolbar).getByText("2 selected")).toBeInTheDocument();
        await userEvent.click(within(toolbar).getByRole("button", { name: "Add tag" }));
        await userEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(screen.queryByLabelText("Tag")).not.toBeInTheDocument();
        await userEvent.click(within(toolbar).getByRole("button", { name: "Add tag" }));
        await userEvent.type(screen.getByLabelText("Tag"), "hot");
        await userEvent.click(screen.getByRole("button", { name: "Add" }));
        expect(api.bulkRecords).toHaveBeenLastCalledWith("contact", "w1", { uids: ["c1", "c2"], action: "addTags", tags: ["hot"] });

        await userEvent.click(await screen.findByLabelText("Select Ann Archer"));
        await userEvent.click(screen.getByRole("button", { name: "Remove tag" }));
        await userEvent.type(screen.getByLabelText("Tag"), "vip");
        await userEvent.click(screen.getByRole("button", { name: "Remove" }));
        expect(api.bulkRecords).toHaveBeenLastCalledWith("contact", "w1", { uids: ["c1"], action: "removeTags", tags: ["vip"] });

        await userEvent.click(screen.getByLabelText("Select Ann Archer"));
        await userEvent.click(screen.getByLabelText("Select Ann Archer"));
        await userEvent.click(screen.getByLabelText("Select Ann Archer"));
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        expect(api.bulkRecords).toHaveBeenCalledTimes(2);
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        expect(api.bulkRecords).toHaveBeenLastCalledWith("contact", "w1", { uids: ["c1"], action: "delete", tags: undefined });
        expect(confirm).toHaveBeenCalledWith("Delete 1 contact? This can't be undone.");

        api.bulkRecords.mockRejectedValue(new ApiRequestError("Nope", 400));
        await userEvent.click(screen.getByLabelText("Select all on this page"));
        await userEvent.click(screen.getByLabelText("Select all on this page"));
        await userEvent.click(screen.getByLabelText("Select all on this page"));
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        expect(confirm).toHaveBeenLastCalledWith("Delete 2 contacts? This can't be undone.");
        expect(await screen.findByText("Nope")).toBeInTheDocument();
    });

    it("creates a record, exports, and reports failures", async () => {
        api.createRecord.mockRejectedValueOnce(new ApiRequestError("There is already a contact with the address a@x.example.", 409)).mockResolvedValue(contact());
        api.exportRecords.mockResolvedValueOnce(undefined).mockRejectedValue(new Error("x"));
        renderList();

        await userEvent.click(await screen.findByRole("button", { name: "+ New contact" }));
        await userEvent.type(screen.getByLabelText("Email"), "a@x.example");
        await userEvent.click(screen.getByRole("button", { name: "Create" }));
        expect(await screen.findByText("There is already a contact with the address a@x.example.")).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText("First name"), "Ann");
        await userEvent.click(screen.getByRole("button", { name: "Create" }));
        expect(api.createRecord).toHaveBeenLastCalledWith("contact", "w1", { email: "a@x.example", firstName: "Ann" });
        await waitFor(() => expect(screen.queryByRole("button", { name: "Create" })).not.toBeInTheDocument());

        await userEvent.click(screen.getByRole("button", { name: "Export" }));
        expect(api.exportRecords).toHaveBeenCalledWith("contact", "w1", { sort: { field: "dateCreated", direction: "desc" } });
        await userEvent.click(screen.getByRole("button", { name: "Export" }));
        expect(await screen.findByText("Could not export.")).toBeInTheDocument();

        api.searchRecords.mockRejectedValue(new Error("down"));
        await userEvent.type(screen.getByLabelText("Search"), "x");
        expect(await screen.findByText("Could not load the contacts.")).toBeInTheDocument();
    });

    it("lists companies, and hides writing from viewers", async () => {
        api.listWorkspaces.mockResolvedValue([workspace({ role: "viewer" })]);
        api.listProperties.mockRejectedValue(new Error("x"));
        api.searchRecords.mockResolvedValue({ items: [company()], total: 1 });
        renderList("company");

        expect(await screen.findByRole("link", { name: "Acme Inc" })).toHaveAttribute("href", "/crm/companies/co1?w=w1");
        expect(screen.queryByRole("button", { name: "+ New company" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByLabelText("Select Acme Inc"));
        expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    });

    it("opens the company form", async () => {
        api.createRecord.mockResolvedValue(company());
        renderList("company");
        await userEvent.click(await screen.findByRole("button", { name: "+ New company" }));
        await userEvent.type(screen.getByLabelText("Name"), "Globex");
        await userEvent.type(screen.getByLabelText("Domain"), "  ");
        await userEvent.click(screen.getByRole("button", { name: "Create" }));
        expect(api.createRecord).toHaveBeenCalledWith("company", "w1", { name: "Globex" });
    });
});

describe("FilterBuilder and fields", () => {
    const fields = recordFields("contact", [
        property(),
        property({ key: "seats", label: "Seats", type: "number", options: [] }),
        property({ key: "since", label: "Since", type: "date", options: [] }),
        property({ key: "beta", label: "Beta", type: "boolean", options: [] }),
        property({ key: "interests", label: "Interests", type: "multi_select" }),
        property({ key: "note", label: "Note", type: "text", options: [] }),
        property({ objectType: "company", key: "tier", label: "Tier", type: "number" }),
    ]);

    it("builds filters from drafts, converting values and skipping incomplete conditions", () => {
        expect(buildFilter(EMPTY_FILTER, fields)).toBeUndefined();
        expect(
            buildFilter(
                {
                    match: "and",
                    conditions: [
                        { field: "properties.seats", op: "gt", value: "5" },
                        { field: "properties.seats", op: "gt", value: "lots" },
                        { field: "properties.beta", op: "eq", value: "false" },
                        { field: "properties.since", op: "lt", value: "2026-01-02" },
                        { field: "email", op: "contains", value: " " },
                        { field: "gone", op: "eq", value: "x" },
                        { field: "tags", op: "isNotSet", value: "" },
                    ],
                },
                fields,
            ),
        ).toEqual({
            and: [
                { field: "properties.seats", op: "gt", value: 5 },
                { field: "properties.beta", op: "eq", value: false },
                { field: "properties.since", op: "lt", value: "2026-01-02T00:00:00.000Z" },
                { field: "tags", op: "isNotSet" },
            ],
        });
    });

    it("offers inputs suited to each field, and resets a condition when its field changes", async () => {
        const onChange = vi.fn();
        const draft = {
            match: "and" as const,
            conditions: [
                { field: "properties.beta", op: "eq", value: "true" },
                { field: "properties.since", op: "lt", value: "" },
                { field: "unknown", op: "contains", value: "" },
            ],
        };
        render(<FilterBuilder fields={fields} draft={draft} onChange={onChange} />);

        expect(screen.getByLabelText("Value 1").tagName).toBe("SELECT");
        expect(screen.getByLabelText("Value 2")).toHaveAttribute("type", "date");
        await userEvent.selectOptions(screen.getByLabelText("Value 1"), "false");
        expect(onChange).toHaveBeenLastCalledWith({ ...draft, conditions: [{ ...draft.conditions[0], value: "false" }, draft.conditions[1], draft.conditions[2]] });
        await userEvent.selectOptions(screen.getByLabelText("Field 1"), "properties.beta");
        expect(onChange.mock.lastCall[0].conditions[0]).toEqual({ field: "properties.beta", op: "eq", value: "true" });
        await userEvent.selectOptions(screen.getByLabelText("Field 2"), "score");
        expect(onChange.mock.lastCall[0].conditions[1]).toEqual({ field: "score", op: "eq", value: "" });
    });

    it("formats values and names records", () => {
        const plan = fields.find((field) => field.name === "properties.plan")!;
        const since = fields.find((field) => field.name === "properties.since")!;
        expect(formatValue(undefined)).toBe("");
        expect(formatValue(["a", "b"])).toBe("a, b");
        expect(formatValue(true)).toBe("Yes");
        expect(formatValue(false)).toBe("No");
        expect(formatValue("pro", plan)).toBe("Pro");
        expect(formatValue("other", plan)).toBe("other");
        expect(formatValue("not a date", since)).toBe("not a date");
        expect(formatValue("2026-01-02T00:00:00.000Z", since)).toBe(new Date("2026-01-02T00:00:00.000Z").toLocaleDateString());
        expect(fieldValue({ properties: { plan: "pro" } }, plan)).toBe("pro");
        expect(fieldValue({}, plan)).toBeUndefined();
        expect(recordFields("company", []).slice(0, COMPANY_FIELDS.length)).toEqual(COMPANY_FIELDS);
        expect(fields.map((field) => field.name)).not.toContain("properties.tier");
        expect(fields.find((field) => field.name === "properties.interests")!.kind).toBe("multi");
        expect(fields.find((field) => field.name === "properties.note")!.kind).toBe("text");
        expect(recordName(contact({ firstName: undefined, lastName: undefined }))).toBe("ann@acme.example");
        expect(recordName(company())).toBe("Acme Inc");
    });
});
