///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils, type RepoUtils } from "@rapidrest/service-core";
import { CrmObjectType, PropertyDefinition, PropertyType, PropertyValue } from "../models/types.js";
import { badRequest, isObject, parseDate } from "../util/Validation.js";

/**
 * The comparisons a filter condition can make. `contains`/`notContains`/`startsWith` are case-insensitive text matches; `in`/`notIn`
 * take a list; `between` takes `[low, high]` (inclusive); `isSet`/`isNotSet` take no value. On a multi-valued field (`tags`, a
 * multi-select property) `eq` means "has this value", `ne` "doesn't have it", `in` "has any of these" and `notIn` "has none of them".
 */
export type FilterOp =
    | "eq"
    | "ne"
    | "contains"
    | "notContains"
    | "startsWith"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "between"
    | "in"
    | "notIn"
    | "isSet"
    | "isNotSet";

/** One comparison of one field: a record field (`email`), a custom property (`properties.<key>`) or `tags`. */
export interface FilterCondition {
    field: string;
    op: FilterOp;
    value?: unknown;
}

/** Conditions and groups combined: every one of `and`, or any one of `or`. A group has exactly one of the two. */
export interface FilterGroup {
    and?: FilterNode[];
    or?: FilterNode[];
}

export type FilterNode = FilterCondition | FilterGroup;

/** The value types a filterable field can hold. */
export type FilterValueType = "string" | "number" | "date" | "boolean";

/** A field a filter may name, and how. */
export interface FilterField {
    type: FilterValueType;
    /** Stored as `PropertyValue` rows (custom properties and tags) rather than on the record itself. */
    stored: "record" | "values";
    /** One row per value (`tags`, a multi-select property). */
    multi?: boolean;
    /** For a select or enum field: the values it may hold. */
    options?: readonly string[];
    /** The `PropertyValue.key` of a `values` field. */
    key?: string;
}

/** How deep groups may nest, and how many conditions and groups one filter may have. */
export const MAX_FILTER_DEPTH = 5;
export const MAX_FILTER_NODES = 50;
/** How many values an `in`/`notIn` list may have. */
export const MAX_FILTER_LIST = 200;
/** How many records a condition on a custom property or tag may match before the filter is refused as too broad. */
export const MAX_VALUE_MATCHES = 20000;

const OPS: readonly FilterOp[] = [
    "eq",
    "ne",
    "contains",
    "notContains",
    "startsWith",
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "in",
    "notIn",
    "isSet",
    "isNotSet",
];

/** Which comparisons each value type allows. */
const OPS_BY_TYPE: Record<FilterValueType, readonly FilterOp[]> = {
    "string": ["eq", "ne", "contains", "notContains", "startsWith", "in", "notIn", "isSet", "isNotSet"],
    "number": ["eq", "ne", "gt", "gte", "lt", "lte", "between", "in", "notIn", "isSet", "isNotSet"],
    date: ["gt", "gte", "lt", "lte", "between", "isSet", "isNotSet"],
    "boolean": ["eq", "ne", "isSet", "isNotSet"],
};

/** The comparisons allowed on a multi-valued field. */
const MULTI_OPS: readonly FilterOp[] = ["eq", "ne", "in", "notIn", "isSet", "isNotSet"];

/** The comparisons that match what the positive form of the same comparison doesn't. */
const NEGATED: Partial<Record<FilterOp, FilterOp>> = { ne: "eq", notIn: "in", notContains: "contains", isNotSet: "isSet" };

/** The `PropertyValue` column a value of `type` is stored in. */
export function valueColumn(type: FilterValueType): "stringValue" | "numberValue" | "dateValue" {
    return type === "date" ? "dateValue" : type === "string" ? "stringValue" : "numberValue";
}

/** The filter value type a custom property's values are compared as. */
export function propertyValueType(type: PropertyType): FilterValueType {
    switch (type) {
        case PropertyType.NUMBER:
            return "number";
        case PropertyType.DATE:
            return "date";
        case PropertyType.BOOLEAN:
            return "boolean";
        default:
            return "string";
    }
}

/**
 * Every field a filter on `objectType` records may name: the record's own `fields`, `tags`, and `properties.<key>` for each of the
 * workspace's custom property `definitions` of that type.
 */
export function filterFields(
    fields: Readonly<Record<string, FilterField>>,
    definitions: readonly Pick<PropertyDefinition, "key" | "type" | "options" | "objectType">[],
    objectType: CrmObjectType,
): Record<string, FilterField> {
    const result: Record<string, FilterField> = { ...fields, tags: { type: "string", stored: "values", multi: true, key: "tags" } };
    for (const definition of definitions) {
        if (definition.objectType !== objectType) {
            continue;
        }
        result[`properties.${definition.key}`] = {
            type: propertyValueType(definition.type),
            stored: "values",
            multi: definition.type === PropertyType.MULTI_SELECT,
            key: definition.key,
            options:
                definition.type === PropertyType.SELECT || definition.type === PropertyType.MULTI_SELECT
                    ? definition.options.map((option) => option.value)
                    : undefined,
        };
    }
    return result;
}

/** One value of `field`'s type, or a 400 naming `where`. */
function coerceValue(field: FilterField, raw: unknown, where: string): string | number | Date | boolean {
    switch (field.type) {
        case "number":
            if (typeof raw === "number" && Number.isFinite(raw)) {
                return raw;
            }
            throw badRequest(`${where} needs a number.`);
        case "date": {
            const date: Date | undefined = parseDate(raw);
            if (date) {
                return date;
            }
            throw badRequest(`${where} needs a date.`);
        }
        case "boolean":
            if (typeof raw === "boolean") {
                return raw;
            }
            throw badRequest(`${where} needs true or false.`);
        default: {
            if (typeof raw !== "string" || raw.length === 0 || raw.length > 256) {
                throw badRequest(`${where} needs text of 1 to 256 characters.`);
            }
            // Tags are stored lowercase; other text is compared as stored, and text matches ignore case anyway.
            const value: string = field.key === "tags" ? raw.trim().toLowerCase() : raw;
            if (field.options && !field.options.includes(value)) {
                throw badRequest(`${where} must be one of: ${field.options.join(", ")}.`);
            }
            return value;
        }
    }
}

/**
 * Checks `node` against `fields` and returns it normalized: every condition's value coerced to its field's type (dates as `Date`s,
 * tags lowercased), and nothing but `field`/`op`/`value` and `and`/`or` kept. A malformed filter, an unknown field, a comparison
 * the field's type doesn't allow, or one that's too big is a 400.
 */
export function validateFilter(node: unknown, fields: Readonly<Record<string, FilterField>>): FilterNode {
    let count: number = 0;
    const visit = (current: unknown, depth: number): FilterNode => {
        if (++count > MAX_FILTER_NODES) {
            throw badRequest(`A filter may have at most ${MAX_FILTER_NODES} conditions and groups.`);
        }
        if (!isObject(current)) {
            throw badRequest("Each part of a filter must be an object.");
        }
        if ("and" in current || "or" in current) {
            const op: "and" | "or" = "and" in current ? "and" : "or";
            const children: unknown = current[op];
            if (("and" in current && "or" in current) || !Array.isArray(children) || children.length === 0) {
                throw badRequest("A filter group must have a non-empty 'and' or 'or' list, and not both.");
            }
            if (depth >= MAX_FILTER_DEPTH) {
                throw badRequest(`Filter groups may nest at most ${MAX_FILTER_DEPTH} deep.`);
            }
            return { [op]: children.map((child) => visit(child, depth + 1)) };
        }
        const fieldName: unknown = current.field;
        const op: unknown = current.op;
        if (typeof fieldName !== "string" || !Object.prototype.hasOwnProperty.call(fields, fieldName)) {
            throw badRequest(`A filter names an unknown field: ${JSON.stringify(fieldName)}.`);
        }
        const field: FilterField = fields[fieldName];
        const where: string = `The '${fieldName}' filter`;
        if (typeof op !== "string" || !(OPS as readonly string[]).includes(op)) {
            throw badRequest(`${where} has an unknown comparison: ${JSON.stringify(op)}.`);
        }
        const allowed: readonly FilterOp[] = field.multi ? MULTI_OPS : OPS_BY_TYPE[field.type];
        if (!allowed.includes(op as FilterOp)) {
            throw badRequest(`${where} can't use '${op}'; it can use: ${allowed.join(", ")}.`);
        }
        const condition: FilterCondition = { field: fieldName, op: op as FilterOp };
        if (op === "isSet" || op === "isNotSet") {
            return condition;
        }
        if (op === "in" || op === "notIn" || op === "between") {
            const list: unknown = current.value;
            if (!Array.isArray(list) || list.length === 0 || list.length > MAX_FILTER_LIST || (op === "between" && list.length !== 2)) {
                throw badRequest(op === "between" ? `${where} needs [low, high].` : `${where} needs a list of 1 to ${MAX_FILTER_LIST} values.`);
            }
            condition.value = list.map((entry) => coerceValue(field, entry, where));
            return condition;
        }
        condition.value = coerceValue(field, current.value, where);
        return condition;
    };
    return visit(node, 0);
}

/** A glob-safe copy of `text` for a `like()` match: `*` and `?` (the glob wildcards) and parentheses removed. */
function globText(text: string): string {
    return text.replace(/[*?()]/g, "");
}

/** The query value for one comparison against a column, in `ModelUtils.buildSearchQuery()`'s form. */
function columnPredicate(op: FilterOp, value: unknown): unknown {
    switch (op) {
        case "eq":
            return ModelUtils.literal(value);
        case "ne":
            return ModelUtils.literal(value, "ne");
        case "gt":
        case "gte":
        case "lt":
        case "lte":
            return ModelUtils.literal(value, op);
        case "between":
            return ModelUtils.literal(value, "range");
        case "in":
            return ModelUtils.literal(value, "in");
        case "notIn":
            return ModelUtils.literal(value, "nin");
        case "contains":
            return `like(*${globText(String(value))}*)`;
        case "startsWith":
            return `like(${globText(String(value))}*)`;
        case "isSet":
            return ModelUtils.literal(null, "ne");
        default:
            // isNotSet
            return ModelUtils.literal(null);
    }
}

/** A value no record's `uid` can have, for a condition that matches no record. */
const NO_UID = "~none~";

/** What `compileFilter()` needs to resolve conditions on custom properties and tags, and on record text it can't negate directly. */
export interface FilterCompileContext {
    workspaceUid: string;
    objectType: CrmObjectType;
    /** The workspace's `PropertyValue`s. */
    valueRepo: RepoUtils<any>;
    /** The records being filtered - for `notContains` on a record's own text, which is compiled as "not one of those that contain". */
    recordRepo: RepoUtils<any>;
}

/** The uids of every record of the context's workspace matching `query` on `repo`, by `field`, or a 400 when there are too many. */
async function matchingUids(repo: RepoUtils<any>, query: Record<string, unknown>, field: "uid" | "objectUid"): Promise<string[]> {
    const uids: Set<string> = new Set();
    for (let page = 0; ; page++) {
        const rows: any[] = await repo.find(query, { ignoreACL: true, limit: 1000, page, skipCache: true });
        for (const row of rows) {
            uids.add(row[field]);
        }
        if (uids.size > MAX_VALUE_MATCHES) {
            throw badRequest(`A filter condition matches more than ${MAX_VALUE_MATCHES} records; narrow it down.`);
        }
        if (rows.length < 1000) {
            return [...uids];
        }
    }
}

/** `{ uid: in(uids) }` - or `nin` when `negated` - with an empty list compiled to "matches nothing" (or "everything"). */
function uidCondition(uids: string[], negated: boolean): Record<string, unknown> {
    if (uids.length === 0) {
        return negated ? { uid: ModelUtils.literal(NO_UID, "ne") } : { uid: ModelUtils.literal(NO_UID) };
    }
    return { uid: ModelUtils.literal(uids, negated ? "nin" : "in") };
}

/**
 * Compiles a validated filter (`validateFilter()`) into a query `RepoUtils.find()`/`count()` runs on both Mongo and SQL: record fields
 * become column comparisons combined with `$and`/`$or`. A condition on a custom property or tag is resolved first against the
 * `PropertyValue` rows (with an index) to the uids of the records it matches, and becomes `uid in (...)`. A negated condition on
 * one (`ne`, `notIn`, `isNotSet`) - and `notContains` on a record's own text, which SQL can't express - becomes `uid not in` the
 * records matching its positive form, so a record with no value at all counts as "not equal".
 *
 * The result doesn't restrict the workspace - `workspaceQuery()` adds that.
 */
export async function compileFilter(
    node: FilterNode,
    fields: Readonly<Record<string, FilterField>>,
    context: FilterCompileContext,
): Promise<Record<string, unknown>> {
    if ("and" in node || "or" in node) {
        const op: "and" | "or" = node.and ? "and" : "or";
        const children: Record<string, unknown>[] = [];
        for (const child of (node.and ?? node.or)!) {
            children.push(await compileFilter(child, fields, context));
        }
        return { [op === "and" ? "$and" : "$or"]: children };
    }
    const condition: FilterCondition = node as FilterCondition;
    const field: FilterField = fields[condition.field];
    const positive: FilterOp = NEGATED[condition.op] ?? condition.op;
    const negated: boolean = positive !== condition.op;

    if (field.stored === "record") {
        if (condition.op !== "notContains") {
            return { [condition.field]: columnPredicate(condition.op, condition.value) };
        }
        const containing: string[] = await matchingUids(
            context.recordRepo,
            { workspaceUid: ModelUtils.literal(context.workspaceUid), [condition.field]: columnPredicate("contains", condition.value) },
            "uid",
        );
        return uidCondition(containing, true);
    }

    const column: string = valueColumn(field.type);
    const query: Record<string, unknown> = {
        workspaceUid: ModelUtils.literal(context.workspaceUid),
        objectType: ModelUtils.literal(context.objectType),
        key: ModelUtils.literal(field.key!),
    };
    if (positive !== "isSet") {
        // A boolean is stored as 1 or 0.
        const value: unknown =
            field.type === "boolean" ? (condition.value ? 1 : 0) : condition.value;
        query[column] = columnPredicate(positive, value);
    }
    return uidCondition(await matchingUids(context.valueRepo, query, "objectUid"), negated);
}

/** `filter` limited to `workspaceUid`'s records: `{ workspaceUid, $and: [filter] }`, or just the workspace with no filter. */
export function workspaceQuery(workspaceUid: string, filter?: Record<string, unknown>): Record<string, unknown> {
    const query: Record<string, unknown> = { workspaceUid: ModelUtils.literal(workspaceUid) };
    if (filter && Object.keys(filter).length > 0) {
        query.$and = [filter];
    }
    return query;
}

/**
 * Whether `record` (with its custom property values and tags in `values`, keyed by `PropertyValue.key`) matches a validated filter -
 * the same answer `compileFilter()`'s query gives, for checking one record without a query (automation conditions, segment
 * membership). Text comparisons ignore case like the query's `like()` does; `eq` on text is exact, as it is in the query.
 */
export function evaluateFilter(
    node: FilterNode,
    fields: Readonly<Record<string, FilterField>>,
    record: Record<string, unknown>,
    values: Readonly<Record<string, readonly unknown[]>>,
): boolean {
    if ("and" in node || "or" in node) {
        return node.and
            ? node.and.every((child) => evaluateFilter(child, fields, record, values))
            : node.or!.some((child) => evaluateFilter(child, fields, record, values));
    }
    const condition: FilterCondition = node as FilterCondition;
    const field: FilterField = fields[condition.field];
    const present: unknown[] =
        field.stored === "values"
            ? [...(values[field.key!] ?? [])]
            : record[condition.field] === undefined || record[condition.field] === null
              ? []
              : [record[condition.field]];
    const positive: FilterOp = NEGATED[condition.op] ?? condition.op;
    const matched: boolean = present.some((value) => compareValue(field, positive, value, condition.value));
    const result: boolean = positive === "isSet" ? present.length > 0 : matched;
    return positive === condition.op ? result : !result;
}

/** A stored value as what it is compared as: dates as milliseconds, booleans as 1 or 0. */
function comparable(field: FilterField, value: unknown): unknown {
    if (field.type === "date") {
        return parseDate(value)?.getTime();
    }
    if (field.type === "boolean") {
        return value === true || value === 1 ? 1 : 0;
    }
    return value;
}

/** Whether one stored value satisfies a positive comparison. */
function compareValue(field: FilterField, op: FilterOp, stored: unknown, operand: unknown): boolean {
    const value: any = comparable(field, stored);
    const target: any = Array.isArray(operand) ? operand.map((entry) => comparable(field, entry)) : comparable(field, operand);
    switch (op) {
        case "eq":
            return value === target;
        case "gt":
            return value > target;
        case "gte":
            return value >= target;
        case "lt":
            return value < target;
        case "lte":
            return value <= target;
        case "between":
            return value >= target[0] && value <= target[1];
        case "in":
            return target.includes(value);
        case "contains":
            return typeof value === "string" && value.toLowerCase().includes(globText(String(operand)).toLowerCase());
        case "startsWith":
            return typeof value === "string" && value.toLowerCase().startsWith(globText(String(operand)).toLowerCase());
        default:
            // isSet: any value at all
            return true;
    }
}
