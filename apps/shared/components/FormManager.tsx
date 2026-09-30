///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import Modal from "@rapidmx/web-client/lib/components/overlays/Modal.js";
import {
    CrmForm,
    FormField as CrmFormField,
    MailingList,
    PropertyDefinition,
    WorkspaceSender,
    createForm,
    deleteForm,
    errorMessage,
    listForms,
    listLists,
    listProperties,
    listSenders,
    updateForm,
} from "../crmApi.js";
import { INPUT_CLASS, useCrm } from "./CrmShell.js";

/** The contact fields a form can ask for, besides custom properties. */
const BASE_TARGETS: { target: string; label: string }[] = [
    { target: "email", label: "Email" },
    { target: "firstName", label: "First name" },
    { target: "lastName", label: "Last name" },
    { target: "phone", label: "Phone" },
    { target: "jobTitle", label: "Job title" },
    { target: "company", label: "Company" },
];

/** The public address of a form, on this site. Browser only. */
export function formUrl(formUid: string): string {
    return `${window.location.origin}/f/${encodeURIComponent(formUid)}`;
}

/** The HTML that embeds a form in another site. */
export function embedCode(formUid: string): string {
    return `<iframe src="${formUrl(formUid)}" title="Signup form" style="width:100%;max-width:560px;height:520px;border:0"></iframe>`;
}

/** A workspace's signup forms: their links and embed code, how often each was submitted, and (for admins) the form editor. */
export default function FormManager() {
    const { workspace, canManage } = useCrm();
    const [forms, setForms] = useState<CrmForm[]>([]);
    const [editing, setEditing] = useState<CrmForm | "new" | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function load(): Promise<void> {
        try {
            setForms(await listForms(workspace.uid));
        } catch (err) {
            setError(errorMessage(err, "Could not load the forms."));
        }
    }

    useEffect(() => {
        void load();
    }, [workspace.uid]);

    return (
        <div className="max-w-5xl">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-lg font-bold tracking-tight">Forms</h1>
                {canManage && (
                    <Button type="button" className="!w-auto" onClick={() => setEditing("new")}>
                        + New form
                    </Button>
                )}
            </div>
            {error && <Alert>{error}</Alert>}
            {forms.length === 0 ? (
                <p className="text-sm text-text-muted">No forms yet.</p>
            ) : (
                <ul className="flex flex-col gap-3">
                    {forms.map((form) => (
                        <li key={form.uid} className="border border-border rounded-sm p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                                <span className="font-medium">
                                    {form.name}
                                    {!form.enabled && <span className="ml-2 text-xs text-text-muted">off</span>}
                                </span>
                                <span className="text-text-muted">{form.submissionCount} submissions</span>
                            </div>
                            <div className="flex flex-wrap gap-4 mt-2">
                                <a className="text-primary-dark hover:underline" href={formUrl(form.uid)} target="_blank" rel="noreferrer">
                                    Open form
                                </a>
                                <button
                                    type="button"
                                    className="text-primary-dark hover:underline"
                                    onClick={async () => {
                                        try {
                                            await navigator.clipboard.writeText(embedCode(form.uid));
                                        } catch {
                                            setError("Could not copy the embed code.");
                                        }
                                    }}
                                >
                                    Copy embed code
                                </button>
                                {canManage && (
                                    <>
                                        <button type="button" className="text-primary-dark hover:underline" onClick={() => setEditing(form)}>
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            className="text-danger hover:underline"
                                            onClick={async () => {
                                                if (window.confirm(`Delete the form "${form.name}"? Its link stops working.`)) {
                                                    await deleteForm(workspace.uid, form.uid);
                                                    await load();
                                                }
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {editing && (
                <FormEditor
                    form={editing === "new" ? undefined : editing}
                    onClose={() => setEditing(null)}
                    onSaved={async () => {
                        setEditing(null);
                        await load();
                    }}
                />
            )}
        </div>
    );
}

/** The editor of a new form, or of `form`. */
function FormEditor({ form, onClose, onSaved }: { form?: CrmForm; onClose: () => void; onSaved: () => Promise<void> }) {
    const { workspace } = useCrm();
    const [lists, setLists] = useState<MailingList[]>([]);
    const [senders, setSenders] = useState<WorkspaceSender[]>([]);
    const [properties, setProperties] = useState<PropertyDefinition[]>([]);
    const [name, setName] = useState(form?.name ?? "");
    const [title, setTitle] = useState(form?.title ?? "");
    const [description, setDescription] = useState(form?.description ?? "");
    const [fields, setFields] = useState<CrmFormField[]>(form?.fields ?? [{ target: "email", label: "Email", required: true }]);
    const [listUids, setListUids] = useState<string[]>(form?.listUids ?? []);
    const [doubleOptIn, setDoubleOptIn] = useState(form?.doubleOptIn ?? true);
    const [senderUid, setSenderUid] = useState(form?.senderUid ?? "");
    const [successMessage, setSuccessMessage] = useState(form?.successMessage ?? "Thanks for signing up!");
    const [redirectUrl, setRedirectUrl] = useState(form?.redirectUrl ?? "");
    const [tags, setTags] = useState((form?.tags ?? []).join(", "));
    const [enabled, setEnabled] = useState(form?.enabled ?? true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([listLists(workspace.uid), listSenders(workspace.uid), listProperties(workspace.uid, "contact")])
            .then(([listResult, senderResult, propertyResult]) => {
                setLists(listResult);
                setSenders(senderResult);
                setProperties(propertyResult);
            })
            .catch((err) => setError(errorMessage(err, "Could not load the lists, senders and properties.")));
    }, [workspace.uid]);

    const targets: { target: string; label: string }[] = [
        ...BASE_TARGETS,
        ...properties.map((definition) => ({ target: `properties.${definition.key}`, label: definition.label })),
    ];
    const unused = targets.filter((entry) => !fields.some((field) => field.target === entry.target));

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        const body: Partial<CrmForm> = {
            name,
            title: title || name,
            description: description || (null as any),
            fields,
            listUids,
            doubleOptIn,
            senderUid: senderUid || (null as any),
            successMessage,
            redirectUrl: redirectUrl || (null as any),
            tags: tags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            enabled,
        };
        try {
            if (form) {
                await updateForm(workspace.uid, form.uid, body);
            } else {
                await createForm(workspace.uid, body);
            }
            await onSaved();
        } catch (err) {
            setError(errorMessage(err, "Could not save the form."));
        }
    }

    const setField = (index: number, change: Partial<CrmFormField>) =>
        setFields((current) => current.map((field, position) => (position === index ? { ...field, ...change } : field)));

    return (
        <Modal open onClose={onClose} title={form ? "Edit form" : "New form"}>
            <form onSubmit={submit} className="flex flex-col gap-3" aria-label="Form editor">
                {error && <Alert>{error}</Alert>}
                <FormField label="Name (only members see it)" htmlFor="form-name">
                    <input id="form-name" className={INPUT_CLASS} value={name} onChange={(event) => setName(event.target.value)} required />
                </FormField>
                <FormField label="Heading" htmlFor="form-title">
                    <input id="form-title" className={INPUT_CLASS} value={title} onChange={(event) => setTitle(event.target.value)} />
                </FormField>
                <FormField label="Text under the heading" htmlFor="form-description">
                    <input id="form-description" className={INPUT_CLASS} value={description} onChange={(event) => setDescription(event.target.value)} />
                </FormField>
                <fieldset className="flex flex-col gap-2">
                    <legend className="text-sm font-medium mb-1">Fields</legend>
                    {fields.map((field, index) => (
                        <div key={field.target} className="flex items-center gap-2">
                            <span className="text-xs text-text-muted w-28 truncate">{targets.find((entry) => entry.target === field.target)?.label ?? field.target}</span>
                            <input
                                aria-label={`Label of ${field.target}`}
                                className={`${INPUT_CLASS} !w-48`}
                                value={field.label}
                                onChange={(event) => setField(index, { label: event.target.value })}
                            />
                            <label className="text-xs flex items-center gap-1">
                                <input
                                    type="checkbox"
                                    checked={field.required}
                                    disabled={field.target === "email"}
                                    onChange={(event) => setField(index, { required: event.target.checked })}
                                />
                                Required
                            </label>
                            {field.target !== "email" && (
                                <button
                                    type="button"
                                    aria-label={`Remove ${field.target}`}
                                    className="text-xs text-text-muted hover:text-danger"
                                    onClick={() => setFields((current) => current.filter((_entry, position) => position !== index))}
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                    ))}
                    {unused.length > 0 && (
                        <select
                            aria-label="Add a field"
                            className={`${INPUT_CLASS} !w-56`}
                            value=""
                            onChange={(event) => {
                                const entry = unused.find((candidate) => candidate.target === event.target.value)!;
                                setFields((current) => [...current, { target: entry.target, label: entry.label, required: false }]);
                            }}
                        >
                            <option value="">+ Add a field&hellip;</option>
                            {unused.map((entry) => (
                                <option key={entry.target} value={entry.target}>
                                    {entry.label}
                                </option>
                            ))}
                        </select>
                    )}
                </fieldset>
                <fieldset className="flex flex-col gap-1">
                    <legend className="text-sm font-medium mb-1">Subscribe to</legend>
                    {lists.length === 0 && <p className="text-xs text-text-muted">No lists yet: the form only collects contacts.</p>}
                    {lists.map((list) => (
                        <label key={list.uid} className="text-sm flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={listUids.includes(list.uid)}
                                onChange={(event) =>
                                    setListUids((current) => (event.target.checked ? [...current, list.uid] : current.filter((uid) => uid !== list.uid)))
                                }
                            />
                            {list.name}
                        </label>
                    ))}
                </fieldset>
                <label className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={doubleOptIn} onChange={(event) => setDoubleOptIn(event.target.checked)} />
                    Ask signups to confirm by email (double opt-in)
                </label>
                <FormField label="Confirmation emails come from" htmlFor="form-sender">
                    <select id="form-sender" className={INPUT_CLASS} value={senderUid} onChange={(event) => setSenderUid(event.target.value)}>
                        <option value="">Nobody</option>
                        {senders.map((sender) => (
                            <option key={sender.uid} value={sender.uid}>
                                {sender.fromName} &lt;{sender.fromAddress}&gt;
                            </option>
                        ))}
                    </select>
                </FormField>
                <FormField label="Message once submitted" htmlFor="form-success">
                    <input id="form-success" className={INPUT_CLASS} value={successMessage} onChange={(event) => setSuccessMessage(event.target.value)} />
                </FormField>
                <FormField label="Or go to this page (https://)" htmlFor="form-redirect">
                    <input id="form-redirect" className={INPUT_CLASS} value={redirectUrl} onChange={(event) => setRedirectUrl(event.target.value)} />
                </FormField>
                <FormField label="Tag contacts with (comma-separated)" htmlFor="form-tags">
                    <input id="form-tags" className={INPUT_CLASS} value={tags} onChange={(event) => setTags(event.target.value)} />
                </FormField>
                <label className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
                    Take submissions
                </label>
                <Button type="submit" className="!w-auto self-end">
                    Save
                </Button>
            </form>
        </Modal>
    );
}
