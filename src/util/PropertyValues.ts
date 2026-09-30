///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils, type RepoUtils } from "@rapidrest/service-core";
import { CrmObjectType, PropertyDefinition, PropertyType, PropertyValue } from "../models/types.js";
import { MAX_LONG_TEXT, badRequest, isObject, parseDate } from "./Validation.js";

/** The `PropertyValue.key` tags are stored under. Never a custom property's key: those can't be one of a record's own fields. */
export const TAGS_KEY = "tags";

/** How many custom property values one request may set. */
export const MAX_PROPERTIES_PER_WRITE = 200;

/** The columns one stored value fills. */
export type StoredValue = Pick<PropertyValue, "stringValue" | "numberValue" | "dateValue">;

/** A property's value as the API shows it: text, a number, a boolean, an ISO date string, or a list of option values. */
export type PropertyViewValue = string | number | boolean | string[];

/**
 * The stored rows for a `properties` object from a request: for each key, the rows to write in place of the record's current ones
 * (none, to clear it with `null`). Every key must name one of `definitions` for `objectType`, and every value must suit its type.
 */
export function readProperties(
    raw: unknown,
    definitions: readonly PropertyDefinition[],
    objectType: CrmObjectType,
): Map<string, StoredValue[]> {
    const result: Map<string, StoredValue[]> = new Map();
    if (raw === undefined) {
        return result;
    }
    if (!isObject(raw)) {
        throw badRequest("'properties' must be an object.");
    }
    const entries: [string, unknown][] = Object.entries(raw);
    if (entries.length > MAX_PROPERTIES_PER_WRITE) {
        throw badRequest(`At most ${MAX_PROPERTIES_PER_WRITE} properties may be set at once.`);
    }
    for (const [key, value] of entries) {
        const definition: PropertyDefinition | undefined = definitions.find((entry) => entry.objectType === objectType && entry.key === key);
        if (!definition) {
            throw badRequest(`There is no ${objectType} property '${key}'.`);
        }
        result.set(key, value === null || value === "" ? [] : storedValues(definition, value));
    }
    return result;
}

/** The rows one property value is stored as, or a 400. */
export function storedValues(definition: PropertyDefinition, value: unknown): StoredValue[] {
    const where: string = `The '${definition.key}' property`;
    const options: string[] = definition.options.map((option) => option.value);
    switch (definition.type) {
        case PropertyType.NUMBER:
            if (typeof value === "number" && Number.isFinite(value)) {
                return [{ numberValue: value }];
            }
            throw badRequest(`${where} must be a number.`);
        case PropertyType.BOOLEAN:
            if (typeof value === "boolean") {
                return [{ numberValue: value ? 1 : 0 }];
            }
            throw badRequest(`${where} must be true or false.`);
        case PropertyType.DATE: {
            const date: Date | undefined = parseDate(value);
            if (date) {
                return [{ dateValue: date }];
            }
            throw badRequest(`${where} must be a date.`);
        }
        case PropertyType.SELECT:
            if (typeof value === "string" && options.includes(value)) {
                return [{ stringValue: value }];
            }
            throw badRequest(`${where} must be one of: ${options.join(", ")}.`);
        case PropertyType.MULTI_SELECT: {
            if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !options.includes(entry))) {
                throw badRequest(`${where} must be a list of: ${options.join(", ")}.`);
            }
            return [...new Set(value as string[])].map((entry) => ({ stringValue: entry }));
        }
        default:
            if (typeof value === "string" && value.trim().length <= MAX_LONG_TEXT) {
                return [{ stringValue: value.trim() }];
            }
            throw badRequest(`${where} must be text of at most ${MAX_LONG_TEXT} characters.`);
    }
}

/** Replaces the rows of one key of one record with `values`. */
export async function writeValues(
    repo: RepoUtils<any>,
    valueClass: any,
    record: { workspaceUid: string; objectType: CrmObjectType; objectUid: string },
    key: string,
    values: readonly StoredValue[],
): Promise<void> {
    await repo.truncate({ objectUid: ModelUtils.literal(record.objectUid), key: ModelUtils.literal(key) }, { ignoreACL: true });
    for (const value of values) {
        await repo.create(new valueClass({ ...record, key, ...value }), { ignoreACL: true, skipPush: true });
    }
}

/** Deletes every custom property value and tag of the records `objectUids`. */
export async function deleteValues(repo: RepoUtils<any>, objectUids: readonly string[]): Promise<void> {
    if (objectUids.length > 0) {
        await repo.truncate({ objectUid: ModelUtils.literal([...objectUids], "in") }, { ignoreACL: true });
    }
}

/** Every stored value of each of `objectUids`, grouped by record and then by key. */
export async function readValues(repo: RepoUtils<any>, objectUids: readonly string[]): Promise<Map<string, Record<string, PropertyValue[]>>> {
    const result: Map<string, Record<string, PropertyValue[]>> = new Map();
    for (let start = 0; start < objectUids.length; start += 500) {
        const batch: string[] = objectUids.slice(start, start + 500);
        for (let page = 0; ; page++) {
            const rows: PropertyValue[] = await repo.find({ objectUid: ModelUtils.literal(batch, "in") }, { ignoreACL: true, limit: 1000, page, skipCache: true });
            for (const row of rows) {
                const byKey: Record<string, PropertyValue[]> = result.get(row.objectUid) ?? {};
                (byKey[row.key] ??= []).push(row);
                result.set(row.objectUid, byKey);
            }
            if (rows.length < 1000) {
                break;
            }
        }
    }
    return result;
}

/** The API view of one record's stored values: `{ key: value }` for each custom property that has one (tags are left out). */
export function propertiesView(values: Record<string, PropertyValue[]> | undefined, definitions: readonly PropertyDefinition[]): Record<string, PropertyViewValue> {
    const view: Record<string, PropertyViewValue> = {};
    for (const [key, rows] of Object.entries(values ?? {})) {
        const definition: PropertyDefinition | undefined = definitions.find((entry) => entry.key === key);
        if (!definition || rows.length === 0) {
            continue;
        }
        switch (definition.type) {
            case PropertyType.NUMBER:
                view[key] = Number(rows[0].numberValue);
                break;
            case PropertyType.BOOLEAN:
                view[key] = Number(rows[0].numberValue) === 1;
                break;
            case PropertyType.DATE:
                view[key] = new Date(rows[0].dateValue as Date).toISOString();
                break;
            case PropertyType.MULTI_SELECT:
                view[key] = rows.map((row) => row.stringValue as string).sort();
                break;
            default:
                view[key] = rows[0].stringValue as string;
        }
    }
    return view;
}

/** The stored values of one record as `evaluateFilter()` takes them: `{ key: [value, ...] }`, dates as `Date`s. */
export function filterValues(values: Record<string, PropertyValue[]> | undefined): Record<string, unknown[]> {
    const result: Record<string, unknown[]> = {};
    for (const [key, rows] of Object.entries(values ?? {})) {
        result[key] = rows.map((row) => row.stringValue ?? (row.numberValue !== undefined && row.numberValue !== null ? Number(row.numberValue) : row.dateValue));
    }
    return result;
}
