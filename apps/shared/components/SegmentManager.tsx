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
    FilterNode,
    MailingList,
    PropertyDefinition,
    Segment,
    SegmentKind,
    SegmentPreview,
    createSegment,
    deleteSegment,
    errorMessage,
    listLists,
    listProperties,
    listSegments,
    previewSegment,
    refreshSegment,
    updateSegment,
} from "../crmApi.js";
import { FieldInfo, recordFields } from "../fields.js";
import { INPUT_CLASS, useCrm } from "./CrmShell.js";
import FilterBuilder, { FilterDraft, buildFilter, draftOf } from "./FilterBuilder.js";

/**
 * A workspace's segments: how many contacts each holds and when that was worked out, a link to its members, and (for editors)
 * creating, changing, refreshing and deleting them. A dynamic segment keeps up with its filter by itself; a static one is a snapshot,
 * refreshed only by hand.
 */
export default function SegmentManager() {
    const { workspace, canWrite, href } = useCrm();
    const [segments, setSegments] = useState<Segment[]>([]);
    const [editing, setEditing] = useState<Segment | "new" | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function load(): Promise<void> {
        try {
            setSegments(await listSegments(workspace.uid));
        } catch (err) {
            setError(errorMessage(err, "Could not load the segments."));
        }
    }

    useEffect(() => {
        void load();
    }, [workspace.uid]);

    async function refresh(segment: Segment): Promise<void> {
        try {
            const refreshed: Segment = await refreshSegment(workspace.uid, segment.uid);
            setSegments(segments.map((entry) => (entry.uid === refreshed.uid ? refreshed : entry)));
        } catch (err) {
            setError(errorMessage(err, "Could not refresh the segment."));
        }
    }

    async function remove(segment: Segment): Promise<void> {
        if (!window.confirm(`Delete the segment "${segment.name}"? Its contacts stay.`)) {
            return;
        }
        try {
            await deleteSegment(workspace.uid, segment.uid);
            await load();
        } catch (err) {
            setError(errorMessage(err, "Could not delete the segment."));
        }
    }

    return (
        <div className="max-w-5xl">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-lg font-bold tracking-tight">Segments</h1>
                {canWrite && (
                    <Button type="button" className="!w-auto" onClick={() => setEditing("new")}>
                        + New segment
                    </Button>
                )}
            </div>
            {error && <Alert>{error}</Alert>}
            {segments.length === 0 ? (
                <p className="text-sm text-text-muted">No segments yet. A segment groups the contacts matching a filter, to find them again or email them.</p>
            ) : (
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr>
                            {["Name", "Kind", "Contacts", "Worked out", ""].map((heading) => (
                                <th key={heading} className="text-left text-xs uppercase tracking-wide text-text-muted py-2 px-2.5 border-b border-border">
                                    {heading}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {segments.map((segment) => (
                            <tr key={segment.uid}>
                                <td className="py-2 px-2.5 border-b border-border">
                                    <span className="font-medium">{segment.name}</span>
                                    {segment.description && <div className="text-xs text-text-muted">{segment.description}</div>}
                                </td>
                                <td className="py-2 px-2.5 border-b border-border">{segment.kind === "dynamic" ? "Dynamic" : "Static"}</td>
                                <td className="py-2 px-2.5 border-b border-border">
                                    {segment.memberCount.toLocaleString()}
                                    {segment.capped && <span className="ml-1 text-xs text-warning">(limit reached)</span>}
                                </td>
                                <td className="py-2 px-2.5 border-b border-border whitespace-nowrap">{segment.refreshedAt ? new Date(segment.refreshedAt).toLocaleString() : "–"}</td>
                                <td className="py-2 px-2.5 border-b border-border text-right whitespace-nowrap">
                                    <a className="text-primary-dark hover:underline font-medium mr-4" href={href(`/crm?segment=${encodeURIComponent(segment.uid)}`)}>
                                        Contacts
                                    </a>
                                    {canWrite && (
                                        <>
                                            <button type="button" className="text-primary-dark hover:underline font-medium mr-4" onClick={() => void refresh(segment)}>
                                                Refresh
                                            </button>
                                            <button type="button" className="text-primary-dark hover:underline font-medium mr-4" onClick={() => setEditing(segment)}>
                                                Edit
                                            </button>
                                            <button type="button" className="text-danger hover:underline" onClick={() => void remove(segment)}>
                                                Delete
                                            </button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {editing && (
                <SegmentEditor
                    segment={editing === "new" ? undefined : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        void load();
                    }}
                />
            )}
        </div>
    );
}

/** The fields a segment's filter may use: every contact field but segments. */
export function useSegmentFields(): FieldInfo[] {
    const { workspace } = useCrm();
    const [definitions, setDefinitions] = useState<PropertyDefinition[]>([]);
    const [lists, setLists] = useState<MailingList[]>([]);
    useEffect(() => {
        listProperties(workspace.uid, "contact").then(setDefinitions, () => setDefinitions([]));
        listLists(workspace.uid).then(setLists, () => setLists([]));
    }, [workspace.uid]);
    return useMemo(() => recordFields("contact", definitions, lists, null), [definitions, lists]);
}

/** Creates or changes a segment, counting the contacts its filter matches as it is edited. */
function SegmentEditor({ segment, onClose, onSaved }: { segment?: Segment; onClose: () => void; onSaved: () => void }) {
    const { workspace } = useCrm();
    const fields: FieldInfo[] = useSegmentFields();
    const [name, setName] = useState(segment?.name ?? "");
    const [description, setDescription] = useState(segment?.description ?? "");
    const [kind, setKind] = useState<SegmentKind>(segment?.kind ?? "dynamic");
    const [draft, setDraft] = useState<FilterDraft>(() => draftOf(segment?.filter));
    const [preview, setPreview] = useState<SegmentPreview | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const filter: FilterNode | undefined = buildFilter(draft, fields);
    const filterKey: string = JSON.stringify(filter ?? null);

    useEffect(() => {
        if (!filter) {
            setPreview(null);
            return;
        }
        let current = true;
        previewSegment(workspace.uid, filter).then(
            (result) => current && setPreview(result),
            () => current && setPreview(null),
        );
        return () => {
            current = false;
        };
    }, [filterKey]);

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setSaving(true);
        const input = { name: name.trim(), description: description.trim() || null, kind, filter };
        try {
            await (segment ? updateSegment(workspace.uid, segment.uid, input) : createSegment(workspace.uid, input));
            onSaved();
        } catch (err) {
            setError(errorMessage(err, "Could not save the segment."));
            setSaving(false);
        }
    }

    return (
        <Modal open onClose={onClose} title={segment ? "Edit segment" : "New segment"}>
            <form onSubmit={submit} className="flex flex-col gap-3 min-w-[36rem]">
                {error && <Alert>{error}</Alert>}
                <FormField label="Name" htmlFor="crm-segment-name">
                    <input id="crm-segment-name" className={INPUT_CLASS} value={name} onChange={(event) => setName(event.target.value)} required />
                </FormField>
                <FormField label="Description" htmlFor="crm-segment-description">
                    <input id="crm-segment-description" className={INPUT_CLASS} value={description} onChange={(event) => setDescription(event.target.value)} />
                </FormField>
                <fieldset className="flex gap-4 text-sm">
                    <legend className="text-xs font-semibold text-text-muted mb-1">Kind</legend>
                    <label className="flex items-center gap-1.5">
                        <input type="radio" name="crm-segment-kind" checked={kind === "dynamic"} onChange={() => setKind("dynamic")} />
                        Dynamic - keeps up with the filter
                    </label>
                    <label className="flex items-center gap-1.5">
                        <input type="radio" name="crm-segment-kind" checked={kind === "static"} onChange={() => setKind("static")} />
                        Static - the contacts matching now
                    </label>
                </fieldset>
                <div>
                    <div className="text-xs font-semibold text-text-muted mb-1">Contacts matching</div>
                    <FilterBuilder fields={fields} draft={draft} onChange={setDraft} />
                </div>
                <div role="status" className="text-sm text-text-muted">
                    {!filter
                        ? "Add a condition to choose the contacts."
                        : preview
                          ? `${preview.capped ? "More than " : ""}${preview.count.toLocaleString()} ${preview.count === 1 ? "contact matches" : "contacts match"} now${preview.contacts.length > 0 ? `, such as ${preview.contacts.map((entry) => entry.email).join(", ")}` : ""}.`
                          : "Counting…"}
                </div>
                <Button type="submit" loading={saving} disabled={saving || !name.trim() || !filter} className="!w-auto self-start">
                    {segment ? "Save" : "Create"}
                </Button>
            </form>
        </Modal>
    );
}
