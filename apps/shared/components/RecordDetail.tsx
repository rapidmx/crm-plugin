///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useMemo, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import {
    CrmObjectType,
    CrmRecord,
    Note,
    PropertyDefinition,
    Task,
    TimelineEvent,
    WorkspaceMember,
    createNote,
    createTask,
    deleteNote,
    deleteRecord,
    errorMessage,
    getRecord,
    listMembers,
    listNotes,
    listProperties,
    listTasks,
    listLists,
    listSubscriptions,
    listTimeline,
    MailingList,
    setSubscriptions,
    Subscription,
    updateRecord,
    updateTask,
    SubjectType,
} from "../crmApi.js";
import { FieldInfo, fieldValue, recordFields } from "../fields.js";
import { INPUT_CLASS, useCrm } from "./CrmShell.js";
import { recordName } from "./RecordList.js";
import ContactDeals from "./deals/ContactDeals.js";

/** The fields the record page edits besides custom properties (tags and dates are shown, not edited here). */
const EDITABLE: Record<CrmObjectType, string[]> = {
    contact: ["email", "firstName", "lastName", "phone", "jobTitle", "lifecycleStage", "leadStatus", "score", "source"],
    company: ["name", "domain", "industry", "employeeCount", "phone", "website", "city", "country"],
};

/** A field's value as its input holds it. */
function inputValue(value: unknown, field: FieldInfo): string {
    if (value === undefined || value === null) {
        return "";
    }
    if (field.kind === "date" && typeof value === "string") {
        return value.slice(0, 10);
    }
    if (Array.isArray(value)) {
        return value.join(", ");
    }
    return String(value);
}

/** An input's text as the value the API takes for `field`: `null` when emptied. */
function apiValue(text: string, field: FieldInfo): unknown {
    if (text.trim() === "") {
        return null;
    }
    switch (field.kind) {
        case "number":
            return Number(text);
        case "boolean":
            return text === "true";
        case "date":
            return new Date(text).toISOString();
        case "multi":
            return text
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean);
        default:
            return text;
    }
}

/**
 * One contact or company: its fields and custom properties (editable by members who can write), its tags and owner, its notes and
 * tasks, and its activity timeline.
 */
export default function RecordDetail({ objectType, uid }: { objectType: CrmObjectType; uid: string }) {
    const { workspace, canWrite, href } = useCrm();
    const [record, setRecord] = useState<CrmRecord | null>(null);
    const [definitions, setDefinitions] = useState<PropertyDefinition[]>([]);
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [values, setValues] = useState<Record<string, string>>({});
    const [tags, setTags] = useState("");
    const [owner, setOwner] = useState("");
    const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
    const [notes, setNotes] = useState<Note[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const fields: FieldInfo[] = useMemo(() => recordFields(objectType, definitions), [objectType, definitions]);
    const editable: FieldInfo[] = fields.filter((field) => field.custom || EDITABLE[objectType].includes(field.name));

    function show(next: CrmRecord, allFields: FieldInfo[]): void {
        setRecord(next);
        setValues(Object.fromEntries(allFields.map((field) => [field.name, inputValue(fieldValue(next, field), field)])));
        setTags(next.tags.join(", "));
        setOwner(next.ownerUserUid ?? "");
    }

    async function loadActivity(): Promise<void> {
        const [entries, noteList, taskList] = await Promise.all([
            listTimeline(workspace.uid, objectType, uid),
            listNotes(workspace.uid, uid),
            listTasks(workspace.uid, { subjectUid: uid }),
        ]);
        setTimeline(entries);
        setNotes(noteList);
        setTasks(taskList);
    }

    useEffect(() => {
        void (async () => {
            try {
                const [loaded, propertyList, memberList] = await Promise.all([
                    getRecord(objectType, workspace.uid, uid),
                    listProperties(workspace.uid, objectType),
                    listMembers(workspace.uid),
                ]);
                setDefinitions(propertyList);
                setMembers(memberList);
                show(loaded, recordFields(objectType, propertyList));
                await loadActivity();
            } catch (err) {
                setError(errorMessage(err, "Could not load this record."));
            }
        })();
    }, [workspace.uid, objectType, uid]);

    async function save(event: FormEvent): Promise<void> {
        event.preventDefault();
        const body: Record<string, unknown> = { version: record!.version, properties: {} };
        for (const field of editable) {
            const value: unknown = apiValue(values[field.name] ?? "", field);
            if (field.custom) {
                (body.properties as Record<string, unknown>)[field.name.slice("properties.".length)] = value;
            } else {
                body[field.name] = value;
            }
        }
        body.tags = tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean);
        body.ownerUserUid = owner || null;
        try {
            show(await updateRecord(objectType, workspace.uid, uid, body), fields);
            setError(null);
            setSaved(true);
            await loadActivity();
        } catch (err) {
            setSaved(false);
            setError(errorMessage(err, "Could not save the changes."));
        }
    }

    async function remove(): Promise<void> {
        if (!window.confirm(`Delete ${recordName(record!)} and everything recorded about them? This can't be undone.`)) {
            return;
        }
        try {
            await deleteRecord(objectType, workspace.uid, uid);
            window.location.assign(href(objectType === "contact" ? "/crm" : "/crm/companies"));
        } catch (err) {
            setError(errorMessage(err, "Could not delete it."));
        }
    }

    if (!record) {
        return error ? <Alert>{error}</Alert> : <p className="text-sm text-text-muted">Loading&hellip;</p>;
    }

    return (
        <div className="max-w-6xl grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8">
            <form onSubmit={save} className="flex flex-col gap-3" aria-label="Record">
                <div className="flex items-center justify-between">
                    <h1 className="text-lg font-bold tracking-tight">{recordName(record)}</h1>
                    {canWrite && (
                        <button type="button" className="text-sm text-danger hover:underline" onClick={remove}>
                            Delete
                        </button>
                    )}
                </div>
                {error && <Alert>{error}</Alert>}
                {saved && <p className="text-sm text-success">Saved.</p>}
                {editable.map((field) => (
                    <FormField key={field.name} label={field.label} htmlFor={`field-${field.name}`}>
                        <FieldInput field={field} value={values[field.name] ?? ""} disabled={!canWrite} onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))} />
                    </FormField>
                ))}
                <FormField label="Tags (comma-separated)" htmlFor="field-tags">
                    <input id="field-tags" className={INPUT_CLASS} value={tags} disabled={!canWrite} onChange={(event) => setTags(event.target.value)} />
                </FormField>
                <FormField label="Owner" htmlFor="field-owner">
                    <select id="field-owner" className={INPUT_CLASS} value={owner} disabled={!canWrite} onChange={(event) => setOwner(event.target.value)}>
                        <option value="">Nobody</option>
                        {members.map((member) => (
                            <option key={member.userUid} value={member.userUid}>
                                {member.displayName || member.address || member.userUid}
                            </option>
                        ))}
                    </select>
                </FormField>
                {canWrite && (
                    <Button type="submit" className="!w-auto self-start">
                        Save
                    </Button>
                )}
            </form>
            <div className="flex flex-col gap-6">
                {objectType === "contact" && <Subscriptions uid={uid} emailStatus={(record as any).emailStatus} onChange={loadActivity} />}
                {objectType === "contact" && <ContactDeals contactUid={uid} />}
                <Notes objectType={objectType} uid={uid} notes={notes} onChange={loadActivity} />
                <Tasks objectType={objectType} uid={uid} tasks={tasks} onChange={loadActivity} />
                <Activity timeline={timeline} />
            </div>
        </div>
    );
}

/** The input of one field, suited to its kind. */
function FieldInput({ field, value, disabled, onChange }: { field: FieldInfo; value: string; disabled: boolean; onChange: (value: string) => void }) {
    const id: string = `field-${field.name}`;
    if (field.kind === "boolean" || field.kind === "select") {
        const options = field.kind === "boolean" ? [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] : field.options ?? [];
        return (
            <select id={id} className={INPUT_CLASS} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
                <option value="">&mdash;</option>
                {options.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                        {entry.label}
                    </option>
                ))}
            </select>
        );
    }
    return (
        <input
            id={id}
            className={INPUT_CLASS}
            type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"}
            placeholder={field.kind === "multi" ? (field.options ?? []).map((entry) => entry.value).join(", ") : undefined}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
        />
    );
}

const STATUS_LABELS: Record<string, string> = { subscribed: "Subscribed", pending: "Awaiting confirmation", unsubscribed: "Unsubscribed" };

/** A contact's subscriptions: every list, with the contact's status on it and a button to subscribe or unsubscribe them. */
function Subscriptions({ uid, emailStatus, onChange }: { uid: string; emailStatus: string; onChange: () => Promise<void> }) {
    const { workspace, canWrite } = useCrm();
    const [lists, setLists] = useState<MailingList[]>([]);
    const [subscriptions, setSubscriptionList] = useState<Subscription[]>([]);
    const [error, setError] = useState<string | null>(null);

    async function load(): Promise<void> {
        const [listResult, subscriptionResult] = await Promise.all([listLists(workspace.uid), listSubscriptions(workspace.uid, uid)]);
        setLists(listResult);
        setSubscriptionList(subscriptionResult);
    }

    useEffect(() => {
        load().catch((err) => setError(errorMessage(err, "Could not load the subscriptions.")));
    }, [workspace.uid, uid]);

    async function toggle(listUid: string, subscribed: boolean): Promise<void> {
        try {
            await setSubscriptions(workspace.uid, { listUid, contactUids: [uid], status: subscribed ? "unsubscribed" : "subscribed" });
            setError(null);
            await load();
            await onChange();
        } catch (err) {
            setError(errorMessage(err, "Could not change the subscription."));
        }
    }

    return (
        <section aria-label="Subscriptions">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted mb-2">Subscriptions</h2>
            {emailStatus !== "active" && <p className="text-sm text-danger mb-2">No marketing email is sent to this contact ({emailStatus}).</p>}
            {error && <Alert>{error}</Alert>}
            {lists.length === 0 && <p className="text-sm text-text-muted">The workspace has no lists yet.</p>}
            <ul className="flex flex-col gap-1">
                {lists.map((list) => {
                    const status: string | undefined = subscriptions.find((entry) => entry.listUid === list.uid)?.status;
                    const subscribed: boolean = status === "subscribed";
                    return (
                        <li key={list.uid} className="text-sm flex items-center gap-2">
                            <span className="flex-1">{list.name}</span>
                            <span className="text-xs text-text-muted">{status ? STATUS_LABELS[status] : "Not subscribed"}</span>
                            {canWrite && (
                                <button type="button" className="text-xs text-primary-dark hover:underline" onClick={() => void toggle(list.uid, subscribed)}>
                                    {subscribed ? "Unsubscribe" : "Subscribe"}
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

/** The record's notes, and a box for a new one. */
/** A record's activity timeline, newest first. */
export function Activity({ timeline }: { timeline: TimelineEvent[] }) {
    return (
        <section aria-label="Activity">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted mb-2">Activity</h2>
            <ol className="flex flex-col gap-2">
                {timeline.map((entry) => (
                    <li key={entry.uid} className="text-sm border-l-2 border-border pl-3">
                        <div>{entry.summary}</div>
                        <div className="text-xs text-text-muted">{new Date(entry.occurredAt).toLocaleString()}</div>
                    </li>
                ))}
            </ol>
        </section>
    );
}

/** A record's notes, and adding and deleting them. */
export function Notes({ objectType, uid, notes, onChange }: { objectType: SubjectType; uid: string; notes: Note[]; onChange: () => Promise<void> }) {
    const { workspace, canWrite } = useCrm();
    const [body, setBody] = useState("");
    const [error, setError] = useState<string | null>(null);

    async function add(event: FormEvent): Promise<void> {
        event.preventDefault();
        try {
            await createNote(workspace.uid, { subjectType: objectType, subjectUid: uid, body });
            setBody("");
            setError(null);
            await onChange();
        } catch (err) {
            setError(errorMessage(err, "Could not add the note."));
        }
    }

    return (
        <section aria-label="Notes">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted mb-2">Notes</h2>
            {error && <Alert>{error}</Alert>}
            {canWrite && (
                <form onSubmit={add} className="flex flex-col gap-2 mb-3">
                    <textarea aria-label="New note" className={INPUT_CLASS} rows={3} value={body} onChange={(event) => setBody(event.target.value)} />
                    <Button type="submit" variant="secondary" disabled={body.trim() === ""} className="!w-auto self-end">
                        Add note
                    </Button>
                </form>
            )}
            <ul className="flex flex-col gap-2">
                {notes.map((note) => (
                    <li key={note.uid} className="text-sm border border-border rounded-sm p-2 whitespace-pre-wrap">
                        {note.body}
                        {canWrite && (
                            <button
                                type="button"
                                aria-label="Delete note"
                                className="block text-xs text-text-muted hover:text-danger mt-1"
                                onClick={async () => {
                                    await deleteNote(workspace.uid, note.uid);
                                    await onChange();
                                }}
                            >
                                Delete
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}

/** The record's tasks: tick one off, or add one. */
/** A record's tasks, and adding and completing them. */
export function Tasks({ objectType, uid, tasks, onChange }: { objectType: SubjectType; uid: string; tasks: Task[]; onChange: () => Promise<void> }) {
    const { workspace, canWrite } = useCrm();
    const [title, setTitle] = useState("");
    const [dueAt, setDueAt] = useState("");
    const [error, setError] = useState<string | null>(null);

    async function add(event: FormEvent): Promise<void> {
        event.preventDefault();
        try {
            await createTask(workspace.uid, { title, subjectType: objectType, subjectUid: uid, ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}) });
            setTitle("");
            setDueAt("");
            setError(null);
            await onChange();
        } catch (err) {
            setError(errorMessage(err, "Could not add the task."));
        }
    }

    return (
        <section aria-label="Tasks">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted mb-2">Tasks</h2>
            {error && <Alert>{error}</Alert>}
            <ul className="flex flex-col gap-1 mb-2">
                {tasks.map((task) => (
                    <li key={task.uid} className="text-sm flex items-center gap-2">
                        <input
                            type="checkbox"
                            aria-label={`Done: ${task.title}`}
                            checked={task.status === "done"}
                            disabled={!canWrite}
                            onChange={async () => {
                                await updateTask(workspace.uid, task.uid, { status: task.status === "done" ? "open" : "done" });
                                await onChange();
                            }}
                        />
                        <span className={task.status === "done" ? "line-through text-text-muted" : ""}>{task.title}</span>
                        {task.dueAt && <span className="text-xs text-text-muted">due {new Date(task.dueAt).toLocaleDateString()}</span>}
                    </li>
                ))}
            </ul>
            {canWrite && (
                <form onSubmit={add} className="flex flex-wrap gap-2">
                    <input aria-label="New task" placeholder="New task" className={`${INPUT_CLASS} !w-56`} value={title} onChange={(event) => setTitle(event.target.value)} />
                    <input aria-label="Due date" type="date" className={`${INPUT_CLASS} !w-40`} value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
                    <Button type="submit" variant="secondary" disabled={title.trim() === ""} className="!w-auto">
                        Add task
                    </Button>
                </form>
            )}
        </section>
    );
}
