///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useMemo, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import Modal from "@rapidmx/web-client/lib/components/overlays/Modal.js";
import {
    CrmObjectType,
    CrmRecord,
    MailingList,
    PropertyDefinition,
    SearchRequest,
    bulkRecords,
    createRecord,
    errorMessage,
    exportRecords,
    listLists,
    listProperties,
    searchRecords,
    setSubscriptions,
} from "../crmApi.js";
import { FieldInfo, fieldValue, formatValue, recordFields } from "../fields.js";
import { INPUT_CLASS, useCrm } from "./CrmShell.js";
import FilterBuilder, { EMPTY_FILTER, FilterDraft, buildFilter } from "./FilterBuilder.js";

/** How many records a page of the list shows. */
export const PAGE_SIZE = 50;

/** The columns of each kind of list, by field name. */
const COLUMNS: Record<CrmObjectType, string[]> = {
    contact: ["email", "firstName", "lastName", "lifecycleStage", "score", "tags", "dateCreated"],
    company: ["name", "domain", "industry", "employeeCount", "city", "tags", "dateCreated"],
};

/** The columns a list may be sorted by. */
const SORTABLE: Record<CrmObjectType, string[]> = {
    contact: ["email", "firstName", "lastName", "score", "lifecycleStage", "dateCreated"],
    company: ["name", "domain", "employeeCount", "dateCreated"],
};

const NOUNS: Record<CrmObjectType, { one: string; many: string; path: string }> = {
    contact: { one: "contact", many: "Contacts", path: "/crm/contacts" },
    company: { one: "company", many: "Companies", path: "/crm/companies" },
};

/**
 * A workspace's contacts or companies: a quick search, a filter builder, a sortable table a page at a time, bulk actions on the ticked
 * rows (add or remove a tag, delete), export of everything matching, and a form for a new record. Each row opens the record.
 */
export default function RecordList({ objectType }: { objectType: CrmObjectType }) {
    const { workspace, canWrite, href } = useCrm();
    const noun = NOUNS[objectType];
    const [definitions, setDefinitions] = useState<PropertyDefinition[]>([]);
    const [query, setQuery] = useState("");
    const [filterOpen, setFilterOpen] = useState(false);
    const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTER);
    const [sort, setSort] = useState<{ field: string; direction: "asc" | "desc" }>({ field: "dateCreated", direction: "desc" });
    const [page, setPage] = useState(0);
    const [records, setRecords] = useState<CrmRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [creating, setCreating] = useState(false);
    const [tagAction, setTagAction] = useState<"addTags" | "removeTags" | null>(null);
    const [lists, setLists] = useState<MailingList[]>([]);
    const [listAction, setListAction] = useState<"subscribed" | "unsubscribed" | null>(null);

    const fields: FieldInfo[] = useMemo(() => recordFields(objectType, definitions, lists), [objectType, definitions, lists]);
    const columns: FieldInfo[] = COLUMNS[objectType].map((name) => fields.find((field) => field.name === name)!);
    const request: SearchRequest = { q: query.trim() || undefined, filter: buildFilter(draft, fields), sort };

    useEffect(() => {
        listProperties(workspace.uid, objectType)
            .then(setDefinitions)
            .catch(() => setDefinitions([]));
        if (objectType === "contact") {
            listLists(workspace.uid)
                .then(setLists)
                .catch(() => setLists([]));
            // `?list=<uid>` (the Lists page's "Subscribers" link) opens the list's subscribers.
            const listUid: string | null = new URLSearchParams(window.location.search).get("list");
            if (listUid) {
                setDraft({ match: "and", conditions: [{ field: "lists", op: "eq", value: listUid }] });
                setFilterOpen(true);
            }
        }
    }, [workspace.uid, objectType]);

    async function load(): Promise<void> {
        setLoading(true);
        try {
            const result = await searchRecords(objectType, workspace.uid, { ...request, limit: PAGE_SIZE, page });
            setRecords(result.items);
            setTotal(result.total);
            setError(null);
        } catch (err) {
            setError(errorMessage(err, `Could not load the ${noun.many.toLowerCase()}.`));
        } finally {
            setLoading(false);
        }
    }

    // Reloads whenever what the list shows changes. The filter is compared by value, since it is rebuilt on every render.
    const requestKey: string = JSON.stringify(request);
    useEffect(() => {
        void load();
    }, [workspace.uid, requestKey, page]);

    function toggleSort(field: string): void {
        setPage(0);
        setSort((current) => (current.field === field ? { field, direction: current.direction === "asc" ? "desc" : "asc" } : { field, direction: "asc" }));
    }

    function toggleRow(uid: string): void {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(uid)) {
                next.delete(uid);
            } else {
                next.add(uid);
            }
            return next;
        });
    }

    async function runBulk(action: "delete" | "addTags" | "removeTags", tags?: string[]): Promise<void> {
        try {
            await bulkRecords(objectType, workspace.uid, { uids: [...selected], action, tags });
            setSelected(new Set());
            setTagAction(null);
            await load();
        } catch (err) {
            setError(errorMessage(err, "Could not change the selected records."));
        }
    }

    async function runListAction(listUid: string): Promise<void> {
        try {
            await setSubscriptions(workspace.uid, { listUid, contactUids: [...selected], status: listAction! });
            setSelected(new Set());
            setListAction(null);
            await load();
        } catch (err) {
            setError(errorMessage(err, "Could not change the selected contacts' subscriptions."));
        }
    }

    async function runExport(): Promise<void> {
        try {
            await exportRecords(objectType, workspace.uid, request);
        } catch (err) {
            setError(errorMessage(err, "Could not export."));
        }
    }

    const pages: number = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const allOnPage: boolean = records.length > 0 && records.every((record) => selected.has(record.uid));

    return (
        <div className="max-w-6xl">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h1 className="text-lg font-bold tracking-tight">
                    {noun.many} <span className="text-text-muted font-normal">({total})</span>
                </h1>
                <div className="flex gap-2">
                    <Button type="button" variant="secondary" className="!w-auto" onClick={runExport}>
                        Export
                    </Button>
                    {canWrite && (
                        <Button type="button" className="!w-auto" onClick={() => setCreating(true)}>
                            + New {noun.one}
                        </Button>
                    )}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <input
                    aria-label="Search"
                    placeholder={`Search ${noun.many.toLowerCase()}`}
                    className={`${INPUT_CLASS} !w-72`}
                    value={query}
                    onChange={(event) => {
                        setPage(0);
                        setQuery(event.target.value);
                    }}
                />
                <button type="button" className="text-sm text-primary-dark hover:underline font-medium" onClick={() => setFilterOpen((open) => !open)}>
                    {filterOpen ? "Hide filters" : `Filters${draft.conditions.length > 0 ? ` (${draft.conditions.length})` : ""}`}
                </button>
            </div>
            {filterOpen && (
                <div className="border border-border rounded-sm p-3 mb-3">
                    <FilterBuilder
                        fields={fields}
                        draft={draft}
                        onChange={(next) => {
                            setPage(0);
                            setDraft(next);
                        }}
                    />
                </div>
            )}
            {error && <Alert>{error}</Alert>}
            {selected.size > 0 && canWrite && (
                <div className="flex items-center gap-3 mb-2 text-sm" role="toolbar" aria-label="Selected records">
                    <span>{selected.size} selected</span>
                    <button type="button" className="text-primary-dark hover:underline" onClick={() => setTagAction("addTags")}>
                        Add tag
                    </button>
                    <button type="button" className="text-primary-dark hover:underline" onClick={() => setTagAction("removeTags")}>
                        Remove tag
                    </button>
                    {objectType === "contact" && lists.length > 0 && (
                        <>
                            <button type="button" className="text-primary-dark hover:underline" onClick={() => setListAction("subscribed")}>
                                Add to list
                            </button>
                            <button type="button" className="text-primary-dark hover:underline" onClick={() => setListAction("unsubscribed")}>
                                Remove from list
                            </button>
                        </>
                    )}
                    <button
                        type="button"
                        className="text-danger hover:underline"
                        onClick={() => {
                            if (window.confirm(`Delete ${selected.size} ${selected.size === 1 ? noun.one : noun.many.toLowerCase()}? This can't be undone.`)) {
                                void runBulk("delete");
                            }
                        }}
                    >
                        Delete
                    </button>
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr>
                            <th className="w-8 py-2 px-2 border-b border-border">
                                <input
                                    type="checkbox"
                                    aria-label="Select all on this page"
                                    checked={allOnPage}
                                    onChange={() => setSelected(allOnPage ? new Set() : new Set(records.map((record) => record.uid)))}
                                />
                            </th>
                            {columns.map((column) => (
                                <th key={column.name} className="text-left text-xs uppercase tracking-wide text-text-muted py-2 px-2.5 border-b border-border whitespace-nowrap">
                                    {SORTABLE[objectType].includes(column.name) ? (
                                        <button type="button" className="uppercase tracking-wide hover:text-text" onClick={() => toggleSort(column.name)}>
                                            {column.label}
                                            {sort.field === column.name ? (sort.direction === "asc" ? " ▲" : " ▼") : ""}
                                        </button>
                                    ) : (
                                        column.label
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {records.map((record) => (
                            <tr key={record.uid} className="hover:bg-surface-alt">
                                <td className="py-2 px-2 border-b border-border">
                                    <input type="checkbox" aria-label={`Select ${recordName(record)}`} checked={selected.has(record.uid)} onChange={() => toggleRow(record.uid)} />
                                </td>
                                {columns.map((column, index) => (
                                    <td key={column.name} className="py-2 px-2.5 border-b border-border">
                                        {index === 0 ? (
                                            <a className="text-primary-dark hover:underline font-medium" href={href(`${noun.path}/${encodeURIComponent(record.uid)}`)}>
                                                {formatValue(fieldValue(record, column), column)}
                                            </a>
                                        ) : (
                                            formatValue(fieldValue(record, column), column)
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {!loading && records.length === 0 && <p className="text-sm text-text-muted mt-4">No {noun.many.toLowerCase()} match.</p>}
            {pages > 1 && (
                <div className="flex items-center gap-3 mt-3 text-sm">
                    <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="disabled:opacity-40">
                        ← Previous
                    </button>
                    <span>
                        Page {page + 1} of {pages}
                    </span>
                    <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className="disabled:opacity-40">
                        Next →
                    </button>
                </div>
            )}
            <NewRecordModal objectType={objectType} open={creating} onClose={() => setCreating(false)} onCreated={() => void load()} />
            <ListModal action={listAction} lists={lists} onClose={() => setListAction(null)} onSubmit={(listUid) => void runListAction(listUid)} />
            <TagModal
                action={tagAction}
                onClose={() => setTagAction(null)}
                onSubmit={(tags) => void runBulk(tagAction!, tags)}
            />
        </div>
    );
}

/** How a record is named in labels: a contact by its name or address, a company by its name. */
export function recordName(record: CrmRecord): string {
    if ("email" in record) {
        const name: string = [record.firstName, record.lastName].filter(Boolean).join(" ");
        return name || record.email;
    }
    return record.name;
}

/** The form for a new contact (email, names) or company (name, domain). */
function NewRecordModal({ objectType, open, onClose, onCreated }: { objectType: CrmObjectType; open: boolean; onClose: () => void; onCreated: () => void }) {
    const { workspace } = useCrm();
    const [values, setValues] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const inputs: [string, string][] =
        objectType === "contact"
            ? [
                  ["email", "Email"],
                  ["firstName", "First name"],
                  ["lastName", "Last name"],
              ]
            : [
                  ["name", "Name"],
                  ["domain", "Domain"],
              ];

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        try {
            const body: Record<string, string> = Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== ""));
            await createRecord(objectType, workspace.uid, body);
            setValues({});
            setError(null);
            onClose();
            onCreated();
        } catch (err) {
            setError(errorMessage(err, "Could not create it."));
        }
    }

    return (
        <Modal open={open} onClose={onClose} title={objectType === "contact" ? "New contact" : "New company"}>
            <form onSubmit={submit} className="flex flex-col gap-3">
                {error && <Alert>{error}</Alert>}
                {inputs.map(([name, label]) => (
                    <FormField key={name} label={label} htmlFor={`new-${name}`}>
                        <input
                            id={`new-${name}`}
                            className={INPUT_CLASS}
                            value={values[name] ?? ""}
                            onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
                        />
                    </FormField>
                ))}
                <Button type="submit" className="!w-auto self-end">
                    Create
                </Button>
            </form>
        </Modal>
    );
}

/** Asks for the list to subscribe the selected contacts to, or unsubscribe them from. */
function ListModal({
    action,
    lists,
    onClose,
    onSubmit,
}: {
    action: "subscribed" | "unsubscribed" | null;
    lists: MailingList[];
    onClose: () => void;
    onSubmit: (listUid: string) => void;
}) {
    const [listUid, setListUid] = useState("");
    return (
        <Modal open={action !== null} onClose={onClose} title={action === "unsubscribed" ? "Remove from a list" : "Add to a list"}>
            <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    onSubmit(listUid);
                    setListUid("");
                }}
            >
                <FormField label="List" htmlFor="bulk-list">
                    <select id="bulk-list" className={INPUT_CLASS} value={listUid} onChange={(event) => setListUid(event.target.value)} required>
                        <option value="">Choose&hellip;</option>
                        {lists.map((list) => (
                            <option key={list.uid} value={list.uid}>
                                {list.name}
                            </option>
                        ))}
                    </select>
                </FormField>
                <Button type="submit" className="!w-auto self-end">
                    {action === "unsubscribed" ? "Remove" : "Add"}
                </Button>
            </form>
        </Modal>
    );
}

/** Asks for the tag to add to or remove from the selected records. */
function TagModal({ action, onClose, onSubmit }: { action: "addTags" | "removeTags" | null; onClose: () => void; onSubmit: (tags: string[]) => void }) {
    const [tag, setTag] = useState("");
    return (
        <Modal open={action !== null} onClose={onClose} title={action === "removeTags" ? "Remove a tag" : "Add a tag"}>
            <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    onSubmit([tag]);
                    setTag("");
                }}
            >
                <FormField label="Tag" htmlFor="bulk-tag">
                    <input id="bulk-tag" className={INPUT_CLASS} value={tag} onChange={(event) => setTag(event.target.value)} required />
                </FormField>
                <Button type="submit" className="!w-auto self-end">
                    {action === "removeTags" ? "Remove" : "Add"}
                </Button>
            </form>
        </Modal>
    );
}
