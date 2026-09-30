///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { CrmObjectType, ImportColumnMapping, PropertyDefinition, PropertyType } from "../models/types.js";
import { TAGS_KEY } from "./PropertyValues.js";
import { badRequest, normalizeTag, parseDate } from "./Validation.js";

/** The import target of a contact column holding its company's name: the company is found by name, or created. */
export const COMPANY_NAME_TARGET = "company";

/** The prefix of a custom property target (`properties.<key>`). */
const PROPERTY_PREFIX = "properties.";

/** The contact and company fields an import may fill, with how their text is read (`number`: as a number). */
export const IMPORT_FIELDS: Readonly<Record<CrmObjectType.CONTACT | CrmObjectType.COMPANY, Readonly<Record<string, "text" | "number">>>> = {
    [CrmObjectType.CONTACT]: {
        email: "text",
        firstName: "text",
        lastName: "text",
        phone: "text",
        jobTitle: "text",
        lifecycleStage: "text",
        leadStatus: "text",
        score: "number",
        source: "text",
    },
    [CrmObjectType.COMPANY]: {
        name: "text",
        domain: "text",
        industry: "text",
        employeeCount: "number",
        phone: "text",
        website: "text",
        city: "text",
        country: "text",
    },
};

/** Header spellings that mean a field, besides its own name (compared with case, spaces and punctuation removed). */
const ALIASES: Readonly<Record<string, readonly string[]>> = {
    email: ["emailaddress", "mail", "e-mail"],
    firstName: ["first", "givenname", "forename"],
    lastName: ["last", "surname", "familyname"],
    phone: ["phonenumber", "telephone", "mobile", "tel"],
    jobTitle: ["title", "position", "role"],
    [COMPANY_NAME_TARGET]: ["companyname", "organization", "organisation", "account"],
    name: ["companyname", "organization", "organisation", "account"],
    domain: ["companydomain", "domainname"],
    website: ["url", "web", "homepage"],
    employeeCount: ["employees", "numberofemployees", "size"],
    tags: ["tag", "labels", "label"],
};

/** A header or target name compared loosely: lowercase, letters and digits only. */
function loose(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Every target a column of an `objectType` import may map to: the record's `importFields`, `tags`, `properties.<key>` for each of its
 * custom properties, and for contacts `company` (the company's name).
 */
export function importTargets(
    objectType: CrmObjectType,
    importFields: Readonly<Record<string, "text" | "number">>,
    definitions: readonly PropertyDefinition[],
): string[] {
    return [
        ...Object.keys(importFields),
        TAGS_KEY,
        ...(objectType === CrmObjectType.CONTACT ? [COMPANY_NAME_TARGET] : []),
        ...definitions.filter((definition) => definition.objectType === objectType).map((definition) => `${PROPERTY_PREFIX}${definition.key}`),
    ];
}

/** A mapping guessed from the header: each column mapped to the target whose name, alias or property label it matches, once. */
export function suggestMapping(columns: readonly string[], targets: readonly string[], definitions: readonly PropertyDefinition[]): ImportColumnMapping[] {
    const used: Set<string> = new Set();
    return columns.map((column) => {
        const header: string = loose(column);
        const target: string | undefined = targets.find((candidate) => {
            if (used.has(candidate)) {
                return false;
            }
            const key: string = candidate.startsWith(PROPERTY_PREFIX) ? candidate.slice(PROPERTY_PREFIX.length) : candidate;
            const label: string | undefined = definitions.find((definition) => definition.key === key)?.label;
            return header === loose(key) || (label !== undefined && header === loose(label)) || (ALIASES[candidate] ?? []).some((alias) => loose(alias) === header);
        });
        if (target) {
            used.add(target);
        }
        return { column, target };
    });
}

/**
 * Checks a mapping from a start request against the CSV's `columns` and the allowed `targets`: one entry per column (a missing one is
 * skipped), each target used once, and the required one (`email` for contacts, `name` for companies) mapped.
 */
export function validateMapping(raw: unknown, columns: readonly string[], targets: readonly string[], required: string): ImportColumnMapping[] {
    if (!Array.isArray(raw)) {
        throw badRequest("'mapping' must be a list of { column, target }.");
    }
    const used: Set<string> = new Set();
    const mapping: ImportColumnMapping[] = columns.map((column) => ({ column }));
    for (const entry of raw) {
        const column: unknown = entry?.column;
        const target: unknown = entry?.target;
        const index: number = typeof column === "string" ? columns.indexOf(column) : -1;
        if (index < 0) {
            throw badRequest(`The mapping names a column the file doesn't have: ${JSON.stringify(column)}.`);
        }
        if (target === undefined || target === null || target === "") {
            continue;
        }
        if (typeof target !== "string" || !targets.includes(target)) {
            throw badRequest(`Column '${column}' is mapped to an unknown field: ${JSON.stringify(target)}.`);
        }
        if (used.has(target) && target !== TAGS_KEY) {
            throw badRequest(`More than one column is mapped to '${target}'.`);
        }
        used.add(target);
        mapping[index] = { column: column as string, target };
    }
    if (!used.has(required)) {
        throw badRequest(`A column must be mapped to '${required}'.`);
    }
    return mapping;
}

/** Splits a list cell (tags, a multi-select) on `;` or `,`. */
function splitList(cell: string): string[] {
    return cell
        .split(/[;,]/)
        .map((part) => part.trim())
        .filter(Boolean);
}

/**
 * One CSV row as a create request: each mapped, non-empty cell read as its target's type (numbers, booleans as true/yes/1 and
 * false/no/0, dates, `;`- or `,`-separated tags and multi-select values), plus `extraTags`. A cell that isn't a valid value for its
 * target is a 400 naming the column.
 */
export function rowToBody(
    row: readonly string[],
    mapping: readonly ImportColumnMapping[],
    importFields: Readonly<Record<string, "text" | "number">>,
    definitions: readonly PropertyDefinition[],
    extraTags: readonly string[],
): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    const properties: Record<string, unknown> = {};
    const tags: string[] = [...extraTags];
    mapping.forEach((entry, index) => {
        const cell: string = (row[index] ?? "").trim();
        if (!entry.target || cell.length === 0) {
            return;
        }
        if (entry.target === TAGS_KEY) {
            for (const part of splitList(cell)) {
                const tag: string | undefined = normalizeTag(part);
                if (tag && !tags.includes(tag)) {
                    tags.push(tag);
                }
            }
            return;
        }
        if (entry.target.startsWith(PROPERTY_PREFIX)) {
            const key: string = entry.target.slice(PROPERTY_PREFIX.length);
            const definition: PropertyDefinition = definitions.find((candidate) => candidate.key === key)!;
            properties[key] = cellValue(definition, cell, entry.column);
            return;
        }
        if (importFields[entry.target] === "number") {
            const value: number = Number(cell.replace(/[\s,]/g, ""));
            if (!Number.isFinite(value)) {
                throw badRequest(`'${entry.column}' must be a number, not '${cell}'.`);
            }
            body[entry.target] = Math.round(value);
            return;
        }
        body[entry.target] = cell;
    });
    if (tags.length > 0) {
        body.tags = tags;
    }
    if (Object.keys(properties).length > 0) {
        body.properties = properties;
    }
    return body;
}

/** One cell as a custom property's value. */
function cellValue(definition: PropertyDefinition, cell: string, column: string): unknown {
    switch (definition.type) {
        case PropertyType.NUMBER: {
            const value: number = Number(cell.replace(/[\s,]/g, ""));
            if (!Number.isFinite(value)) {
                throw badRequest(`'${column}' must be a number, not '${cell}'.`);
            }
            return value;
        }
        case PropertyType.BOOLEAN: {
            const lower: string = cell.toLowerCase();
            if (["true", "yes", "y", "1"].includes(lower)) {
                return true;
            }
            if (["false", "no", "n", "0"].includes(lower)) {
                return false;
            }
            throw badRequest(`'${column}' must be yes or no, not '${cell}'.`);
        }
        case PropertyType.DATE: {
            const date: Date | undefined = parseDate(cell);
            if (!date) {
                throw badRequest(`'${column}' must be a date, not '${cell}'.`);
            }
            return date.toISOString();
        }
        case PropertyType.MULTI_SELECT:
            return splitList(cell);
        default:
            return cell;
    }
}
