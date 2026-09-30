///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { CrmObjectType, MailingList, PropertyDefinition, Segment } from "./crmApi.js";

/** How a field's value is entered and compared. */
export type FieldKind = "text" | "number" | "date" | "boolean" | "select" | "multi";

/** A field the list pages show, edit and filter on. */
export interface FieldInfo {
    /** The API name: a record field, `tags`, or `properties.<key>`. */
    name: string;
    label: string;
    kind: FieldKind;
    options?: { value: string; label: string }[];
    /** A custom property rather than one of the record's own fields. */
    custom?: boolean;
}

const option = (value: string, label: string) => ({ value, label });

/** Where a contact is in the customer journey, in order. */
export const LIFECYCLE_STAGES = [
    option("subscriber", "Subscriber"),
    option("lead", "Lead"),
    option("marketing_qualified", "Marketing qualified lead"),
    option("sales_qualified", "Sales qualified lead"),
    option("opportunity", "Opportunity"),
    option("customer", "Customer"),
    option("evangelist", "Evangelist"),
    option("other", "Other"),
];

export const EMAIL_STATUSES = [option("active", "Active"), option("unsubscribed", "Unsubscribed"), option("bounced", "Bounced"), option("complained", "Complained")];

/** A contact's own fields. */
export const CONTACT_FIELDS: FieldInfo[] = [
    { name: "email", label: "Email", kind: "text" },
    { name: "firstName", label: "First name", kind: "text" },
    { name: "lastName", label: "Last name", kind: "text" },
    { name: "phone", label: "Phone", kind: "text" },
    { name: "jobTitle", label: "Job title", kind: "text" },
    { name: "lifecycleStage", label: "Lifecycle stage", kind: "select", options: LIFECYCLE_STAGES },
    { name: "leadStatus", label: "Lead status", kind: "text" },
    { name: "score", label: "Score", kind: "number" },
    { name: "source", label: "Source", kind: "text" },
    { name: "emailStatus", label: "Email status", kind: "select", options: EMAIL_STATUSES },
    { name: "lastEngagedAt", label: "Last engaged", kind: "date" },
    { name: "dateCreated", label: "Created", kind: "date" },
];

/** A company's own fields. */
export const COMPANY_FIELDS: FieldInfo[] = [
    { name: "name", label: "Name", kind: "text" },
    { name: "domain", label: "Domain", kind: "text" },
    { name: "industry", label: "Industry", kind: "text" },
    { name: "employeeCount", label: "Employees", kind: "number" },
    { name: "phone", label: "Phone", kind: "text" },
    { name: "website", label: "Website", kind: "text" },
    { name: "city", label: "City", kind: "text" },
    { name: "country", label: "Country", kind: "text" },
    { name: "dateCreated", label: "Created", kind: "date" },
];

/** The kind of a custom property's field. */
export function propertyKind(definition: PropertyDefinition): FieldKind {
    switch (definition.type) {
        case "number":
        case "date":
        case "boolean":
        case "select":
            return definition.type;
        case "multi_select":
            return "multi";
        default:
            return "text";
    }
}

/**
 * Every field of `objectType` records: their own, `tags`, a contact's `lists` and `segments` (those given; none when `segments` is
 * `null`, for a segment's own filter), and the workspace's custom properties for them.
 */
export function recordFields(objectType: CrmObjectType, definitions: PropertyDefinition[], lists: MailingList[] = [], segments: Segment[] | null = []): FieldInfo[] {
    return [
        ...(objectType === "contact" ? CONTACT_FIELDS : COMPANY_FIELDS),
        { name: "tags", label: "Tags", kind: "multi" },
        ...(objectType === "contact"
            ? [{ name: "lists", label: "Lists", kind: "multi" as const, options: lists.map((list) => ({ value: list.uid, label: list.name })) }]
            : []),
        ...(objectType === "contact" && segments !== null
            ? [{ name: "segments", label: "Segments", kind: "multi" as const, options: segments.map((segment) => ({ value: segment.uid, label: segment.name })) }]
            : []),
        ...definitions
            .filter((definition) => definition.objectType === objectType)
            .map((definition) => ({
                name: `properties.${definition.key}`,
                label: definition.label,
                kind: propertyKind(definition),
                options: definition.options,
                custom: true,
            })),
    ];
}

/** The comparisons offered for each kind of field, with their labels. */
export const OPERATORS: Record<FieldKind, { op: string; label: string }[]> = {
    text: [
        { op: "contains", label: "contains" },
        { op: "notContains", label: "doesn't contain" },
        { op: "eq", label: "is" },
        { op: "ne", label: "is not" },
        { op: "startsWith", label: "starts with" },
        { op: "isSet", label: "is known" },
        { op: "isNotSet", label: "is unknown" },
    ],
    "number": [
        { op: "eq", label: "=" },
        { op: "ne", label: "≠" },
        { op: "gt", label: ">" },
        { op: "gte", label: "≥" },
        { op: "lt", label: "<" },
        { op: "lte", label: "≤" },
        { op: "isSet", label: "is known" },
        { op: "isNotSet", label: "is unknown" },
    ],
    date: [
        { op: "gt", label: "is after" },
        { op: "lt", label: "is before" },
        { op: "isSet", label: "is known" },
        { op: "isNotSet", label: "is unknown" },
    ],
    "boolean": [
        { op: "eq", label: "is" },
        { op: "isSet", label: "is known" },
        { op: "isNotSet", label: "is unknown" },
    ],
    select: [
        { op: "eq", label: "is" },
        { op: "ne", label: "is not" },
        { op: "isSet", label: "is known" },
        { op: "isNotSet", label: "is unknown" },
    ],
    multi: [
        { op: "eq", label: "includes" },
        { op: "ne", label: "doesn't include" },
        { op: "isSet", label: "has any" },
        { op: "isNotSet", label: "has none" },
    ],
};

/** A property value as a table cell shows it. */
export function formatValue(value: unknown, field?: FieldInfo): string {
    if (value === undefined || value === null || value === "") {
        return "";
    }
    if (Array.isArray(value)) {
        return value.map((entry) => formatValue(entry, field)).join(", ");
    }
    if (typeof value === "boolean") {
        return value ? "Yes" : "No";
    }
    if (field?.kind === "date" && typeof value === "string") {
        const date: Date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
    }
    const label: string | undefined = field?.options?.find((entry) => entry.value === value)?.label;
    return label ?? String(value);
}

/** A record's value of `field`: its own field, its tags, or one of its custom properties. */
export function fieldValue(record: Record<string, any>, field: FieldInfo): unknown {
    return field.name.startsWith("properties.") ? record.properties?.[field.name.slice("properties.".length)] : record[field.name];
}
