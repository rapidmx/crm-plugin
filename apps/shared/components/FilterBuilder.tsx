///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { HiOutlineXMark } from "react-icons/hi2";
import { FilterCondition, FilterGroup, FilterNode } from "../crmApi.js";
import { FieldInfo, OPERATORS } from "../fields.js";
import { INPUT_CLASS } from "./CrmShell.js";

/** One condition as the builder edits it: the value is kept as typed, and converted when the filter is built. */
export interface ConditionDraft {
    field: string;
    op: string;
    value: string;
}

export interface FilterDraft {
    match: "and" | "or";
    conditions: ConditionDraft[];
}

export const EMPTY_FILTER: FilterDraft = { match: "and", conditions: [] };

/** Whether a comparison takes a value. */
function takesValue(op: string): boolean {
    return op !== "isSet" && op !== "isNotSet";
}

/**
 * The API filter of a draft (`undefined` when it has no complete condition): each condition's typed value converted to its field's
 * type - numbers, booleans, dates as ISO strings - and the conditions combined by `match`. A condition still missing its value is left
 * out.
 */
export function buildFilter(draft: FilterDraft, fields: FieldInfo[]): FilterNode | undefined {
    const conditions: FilterCondition[] = [];
    for (const condition of draft.conditions) {
        const field: FieldInfo | undefined = fields.find((entry) => entry.name === condition.field);
        if (!field) {
            continue;
        }
        if (!takesValue(condition.op)) {
            conditions.push({ field: field.name, op: condition.op });
            continue;
        }
        if (condition.value.trim() === "") {
            continue;
        }
        let value: unknown = condition.value;
        if (field.kind === "number") {
            value = Number(condition.value);
            if (!Number.isFinite(value)) {
                continue;
            }
        } else if (field.kind === "boolean") {
            value = condition.value === "true";
        } else if (field.kind === "date") {
            value = new Date(condition.value).toISOString();
        }
        conditions.push({ field: field.name, op: condition.op, value });
    }
    if (conditions.length === 0) {
        return undefined;
    }
    return conditions.length === 1 ? conditions[0] : { [draft.match]: conditions };
}

/**
 * The draft of an API filter `buildFilter()` made - a condition, or an `and`/`or` group of conditions - for editing it again. Dates
 * come back as their day; anything deeper than one group is left out.
 */
export function draftOf(filter: FilterNode | null | undefined): FilterDraft {
    if (!filter) {
        return EMPTY_FILTER;
    }
    const match: "and" | "or" = "or" in filter && filter.or ? "or" : "and";
    const nodes: FilterNode[] = "field" in filter ? [filter] : ((filter)[match] ?? []);
    return {
        match,
        conditions: nodes
            .filter((node): node is FilterCondition => "field" in node)
            .map((node) => ({
                field: node.field,
                op: node.op,
                value: node.value === undefined || node.value === null ? "" : typeof node.value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(node.value) ? node.value.slice(0, 10) : String(node.value),
            })),
    };
}

/** A new condition on `field`, with its kind's first comparison. */
function newCondition(field: FieldInfo): ConditionDraft {
    return { field: field.name, op: OPERATORS[field.kind][0].op, value: field.kind === "boolean" ? "true" : "" };
}

/**
 * Edits a list of filter conditions, all of which (`and`) or any of which (`or`) a record must match. Each row picks a field (the
 * record's own, tags, or a custom property), a comparison suited to it, and a value in an input suited to it.
 */
export default function FilterBuilder({ fields, draft, onChange }: { fields: FieldInfo[]; draft: FilterDraft; onChange: (draft: FilterDraft) => void }) {
    const update = (index: number, change: Partial<ConditionDraft>): void => {
        const conditions: ConditionDraft[] = draft.conditions.map((condition, position) => (position === index ? { ...condition, ...change } : condition));
        onChange({ ...draft, conditions });
    };

    return (
        <div className="flex flex-col gap-2" role="group" aria-label="Filters">
            {draft.conditions.length > 1 && (
                <label className="text-sm flex items-center gap-2">
                    Match
                    <select
                        aria-label="Match"
                        className={`${INPUT_CLASS} !w-auto`}
                        value={draft.match}
                        onChange={(event) => onChange({ ...draft, match: event.target.value as "and" | "or" })}
                    >
                        <option value="and">all conditions</option>
                        <option value="or">any condition</option>
                    </select>
                </label>
            )}
            {draft.conditions.map((condition, index) => {
                const field: FieldInfo = fields.find((entry) => entry.name === condition.field) ?? fields[0];
                return (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                        <select
                            aria-label={`Field ${index + 1}`}
                            className={`${INPUT_CLASS} !w-48`}
                            value={field.name}
                            onChange={(event) => {
                                const next: FieldInfo = fields.find((entry) => entry.name === event.target.value)!;
                                update(index, newCondition(next));
                            }}
                        >
                            {fields.map((entry) => (
                                <option key={entry.name} value={entry.name}>
                                    {entry.label}
                                </option>
                            ))}
                        </select>
                        <select aria-label={`Comparison ${index + 1}`} className={`${INPUT_CLASS} !w-40`} value={condition.op} onChange={(event) => update(index, { op: event.target.value })}>
                            {OPERATORS[field.kind].map(({ op, label }) => (
                                <option key={op} value={op}>
                                    {label}
                                </option>
                            ))}
                        </select>
                        {takesValue(condition.op) && <ValueInput field={field} index={index} value={condition.value} onChange={(value) => update(index, { value })} />}
                        <button
                            type="button"
                            aria-label={`Remove condition ${index + 1}`}
                            className="text-text-muted hover:text-danger"
                            onClick={() => onChange({ ...draft, conditions: draft.conditions.filter((_entry, position) => position !== index) })}
                        >
                            <HiOutlineXMark aria-hidden className="w-4 h-4" />
                        </button>
                    </div>
                );
            })}
            <div>
                <button
                    type="button"
                    className="text-sm text-primary-dark hover:underline font-medium"
                    onClick={() => onChange({ ...draft, conditions: [...draft.conditions, newCondition(fields[0])] })}
                >
                    + Add condition
                </button>
            </div>
        </div>
    );
}

/** The value input of a condition, suited to its field. */
function ValueInput({ field, index, value, onChange }: { field: FieldInfo; index: number; value: string; onChange: (value: string) => void }) {
    const label: string = `Value ${index + 1}`;
    if (field.kind === "boolean") {
        return (
            <select aria-label={label} className={`${INPUT_CLASS} !w-28`} value={value} onChange={(event) => onChange(event.target.value)}>
                <option value="true">Yes</option>
                <option value="false">No</option>
            </select>
        );
    }
    if (field.options && field.options.length > 0) {
        return (
            <select aria-label={label} className={`${INPUT_CLASS} !w-48`} value={value} onChange={(event) => onChange(event.target.value)}>
                <option value="">Choose&hellip;</option>
                {field.options.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                        {entry.label}
                    </option>
                ))}
            </select>
        );
    }
    return (
        <input
            aria-label={label}
            className={`${INPUT_CLASS} !w-48`}
            type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"}
            value={value}
            onChange={(event) => onChange(event.target.value)}
        />
    );
}
