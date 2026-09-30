///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils } from "@rapidrest/service-core";
import {
    FilterField,
    FilterNode,
    compileFilter,
    evaluateFilter,
    filterFields,
    propertyValueType,
    validateFilter,
    valueColumn,
    workspaceQuery,
} from "../../src/filters/Filter.js";
import { CONTACT_FIELDS } from "../../src/filters/fields.js";
import { CrmObjectType, PropertyType } from "../../src/models/types.js";

const definitions: any[] = [
    { objectType: "contact", key: "plan", type: PropertyType.SELECT, options: [{ value: "free" }, { value: "pro" }] },
    { objectType: "contact", key: "seats", type: PropertyType.NUMBER, options: [] },
    { objectType: "contact", key: "since", type: PropertyType.DATE, options: [] },
    { objectType: "contact", key: "beta", type: PropertyType.BOOLEAN, options: [] },
    { objectType: "contact", key: "interests", type: PropertyType.MULTI_SELECT, options: [{ value: "mail" }, { value: "crm" }] },
    { objectType: "contact", key: "about", type: PropertyType.TEXT, options: [] },
    { objectType: "company", key: "tier", type: PropertyType.NUMBER, options: [] },
];
const fields: Record<string, FilterField> = filterFields(CONTACT_FIELDS, definitions, CrmObjectType.CONTACT);

/** Validates, then evaluates, `filter` against one record and its stored values. */
function matches(filter: unknown, record: Record<string, unknown>, values: Record<string, unknown[]> = {}): boolean {
    return evaluateFilter(validateFilter(filter, fields), fields, record, values);
}

describe("filterFields()", () => {
    it("adds tags and the object type's custom properties, typed and with their options", () => {
        expect(fields.tags).toEqual({ type: "string", stored: "values", multi: true, key: "tags" });
        expect(fields["properties.plan"]).toEqual({ type: "string", stored: "values", multi: false, key: "plan", options: ["free", "pro"] });
        expect(fields["properties.interests"].multi).toBe(true);
        expect(fields["properties.seats"]).toMatchObject({ type: "number", options: undefined });
        expect(fields["properties.tier"]).toBeUndefined();
    });

    it("maps property types and value columns", () => {
        expect([PropertyType.NUMBER, PropertyType.DATE, PropertyType.BOOLEAN, PropertyType.TEXT, PropertyType.SELECT].map(propertyValueType)).toEqual([
            "number",
            "date",
            "boolean",
            "string",
            "string",
        ]);
        expect(["date", "string", "number", "boolean"].map((type) => valueColumn(type as any))).toEqual(["dateValue", "stringValue", "numberValue", "numberValue"]);
    });
});

describe("validateFilter()", () => {
    it("normalizes values: dates to Dates, tags to lowercase, lists element by element", () => {
        expect(validateFilter({ field: "dateCreated", op: "between", value: ["2026-01-01", "2026-02-01"], extra: 1 }, fields)).toEqual({
            field: "dateCreated",
            op: "between",
            value: [new Date("2026-01-01"), new Date("2026-02-01")],
        });
        expect(validateFilter({ or: [{ field: "tags", op: "eq", value: " VIP " }, { field: "email", op: "isSet", value: "ignored" }] }, fields)).toEqual({
            or: [{ field: "tags", op: "eq", value: "vip" }, { field: "email", op: "isSet" }],
        });
    });

    it.each([
        [null, "must be an object"],
        [[], "must be an object"],
        [{ or: {} }, "non-empty"],
        [{ field: "toString", op: "eq", value: "x" }, "unknown field"],
        [{ field: "email", op: "toString", value: "x" }, "unknown comparison"],
        [{ field: "email", op: "gt", value: "x" }, "can't use 'gt'"],
        [{ field: "properties.beta", op: "gt", value: true }, "can't use 'gt'"],
        [{ field: "dateCreated", op: "eq", value: "2026-01-01" }, "can't use 'eq'"],
        [{ field: "properties.interests", op: "contains", value: "m" }, "can't use 'contains'"],
        [{ field: "score", op: "eq", value: Infinity }, "needs a number"],
        [{ field: "properties.beta", op: "eq", value: 1 }, "needs true or false"],
        [{ field: "email", op: "eq", value: "x".repeat(257) }, "1 to 256"],
        [{ field: "lifecycleStage", op: "in", value: ["lead", "whale"] }, "must be one of"],
        [{ field: "score", op: "notIn", value: Array.from({ length: 201 }, () => 1) }, "1 to 200"],
    ])("refuses %j", (filter, message) => {
        expect(() => validateFilter(filter, fields)).toThrow(message);
    });
});

describe("evaluateFilter()", () => {
    const record = { email: "Ann@Acme.example", firstName: "Ann", score: 50, lifecycleStage: "customer", dateCreated: "2026-03-01T00:00:00.000Z", lastName: null };
    const values = { tags: ["vip"], plan: ["pro"], seats: [10], since: [new Date("2025-01-01")], beta: [1], interests: ["mail", "crm"] };

    it.each([
        [{ field: "email", op: "contains", value: "acme" }, true],
        [{ field: "email", op: "startsWith", value: "ANN" }, true],
        [{ field: "email", op: "notContains", value: "acme" }, false],
        [{ field: "email", op: "eq", value: "ann@acme.example" }, false],
        [{ field: "firstName", op: "ne", value: "Bob" }, true],
        [{ field: "score", op: "gt", value: 49 }, true],
        [{ field: "score", op: "lte", value: 49 }, false],
        [{ field: "score", op: "lt", value: 51 }, true],
        [{ field: "score", op: "gte", value: 50 }, true],
        [{ field: "score", op: "between", value: [10, 50] }, true],
        [{ field: "score", op: "in", value: [1, 50] }, true],
        [{ field: "score", op: "notIn", value: [50] }, false],
        [{ field: "lastName", op: "isNotSet" }, true],
        [{ field: "phone", op: "isSet" }, false],
        [{ field: "dateCreated", op: "gt", value: "2026-02-01" }, true],
        [{ field: "tags", op: "eq", value: "VIP" }, true],
        [{ field: "tags", op: "ne", value: "vip" }, false],
        [{ field: "properties.plan", op: "in", value: ["free"] }, false],
        [{ field: "properties.seats", op: "gte", value: 10 }, true],
        [{ field: "properties.since", op: "lt", value: "2025-06-01" }, true],
        [{ field: "properties.beta", op: "eq", value: true }, true],
        [{ field: "properties.beta", op: "ne", value: true }, false],
        [{ field: "properties.interests", op: "notIn", value: ["crm"] }, false],
        [{ field: "properties.about", op: "isNotSet" }, true],
        [{ field: "properties.plan", op: "isSet" }, true],
        [{ and: [{ field: "score", op: "gt", value: 1 }, { field: "tags", op: "eq", value: "vip" }] }, true],
        [{ and: [{ field: "score", op: "gt", value: 1 }, { field: "tags", op: "eq", value: "nope" }] }, false],
        [{ or: [{ field: "score", op: "gt", value: 100 }, { field: "tags", op: "eq", value: "vip" }] }, true],
    ])("evaluates %j as %s", (filter, expected) => {
        expect(matches(filter, record, values)).toBe(expected);
    });

    it("reads a stored boolean false as 0, and a record with no values at all", () => {
        expect(matches({ field: "properties.beta", op: "eq", value: false }, {}, { beta: [0] })).toBe(true);
        expect(matches({ field: "properties.beta", op: "eq", value: false }, {}, {})).toBe(false);
        expect(matches({ field: "properties.beta", op: "eq", value: true }, {}, { beta: [true] })).toBe(true);
        expect(matches({ field: "firstName", op: "contains", value: "a" }, { firstName: 5 })).toBe(false);
        expect(matches({ field: "firstName", op: "startsWith", value: "a" }, { firstName: 5 })).toBe(false);
    });
});

describe("compileFilter() and workspaceQuery()", () => {
    /** A repo double answering `find()` from a fixed list of rows, a page at a time. */
    const repoOf = (rows: any[]) => ({
        find: vi.fn(async (_query: any, options: any) => rows.slice(options.page * options.limit, (options.page + 1) * options.limit)),
    });

    it("compiles record comparisons to literal predicates and groups to $and/$or", async () => {
        const context: any = { workspaceUid: "w", objectType: CrmObjectType.CONTACT, valueRepo: repoOf([]), recordRepo: repoOf([]) };
        const node: FilterNode = validateFilter(
            {
                and: [
                    { field: "score", op: "between", value: [1, 2] },
                    { or: [{ field: "email", op: "contains", value: "a*b?(c)" }, { field: "email", op: "startsWith", value: "z" }] },
                    { field: "lastName", op: "isSet" },
                ],
            },
            fields,
        );
        const compiled: any = await compileFilter(node, fields, context);
        expect(compiled.$and[0].score).toEqual(ModelUtils.literal([1, 2], "range"));
        expect(compiled.$and[1].$or).toEqual([{ email: "like(*abc*)" }, { email: "like(z*)" }]);
        expect(compiled.$and[2].lastName).toEqual(ModelUtils.literal(null, "ne"));
        expect(workspaceQuery("w", compiled).$and).toEqual([compiled]);
        expect(workspaceQuery("w", {})).toEqual({ workspaceUid: ModelUtils.literal("w") });
        expect(workspaceQuery("w")).toEqual({ workspaceUid: ModelUtils.literal("w") });
    });

    it("resolves value conditions page by page, and refuses one matching too many records", async () => {
        const many = Array.from({ length: 1500 }, (_value, index) => ({ objectUid: `c${index}` }));
        const valueRepo = repoOf(many);
        const context: any = { workspaceUid: "w", objectType: CrmObjectType.CONTACT, valueRepo, recordRepo: repoOf([]) };
        const compiled: any = await compileFilter(validateFilter({ field: "properties.beta", op: "eq", value: true }, fields), fields, context);
        expect(valueRepo.find).toHaveBeenCalledTimes(2);
        expect(valueRepo.find.mock.calls[0][0].numberValue).toEqual(ModelUtils.literal(1));
        expect(compiled.uid.value).toHaveLength(1500);

        const tooMany = repoOf(Array.from({ length: 20001 }, (_value, index) => ({ objectUid: `c${index}` })));
        await expect(
            compileFilter(validateFilter({ field: "tags", op: "isSet" }, fields), fields, { ...context, valueRepo: tooMany }),
        ).rejects.toThrow("more than 20000");
    });
});
