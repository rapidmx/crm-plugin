///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import Modal from "@rapidmx/web-client/lib/components/overlays/Modal.js";
import { MailingList, WorkspaceSender, createList, deleteList, errorMessage, listLists, listSenders, updateList } from "../crmApi.js";
import { INPUT_CLASS, useCrm } from "./CrmShell.js";

/** What the list form edits. */
interface ListDraft {
    name: string;
    publicName: string;
    description: string;
    publicDescription: string;
    doubleOptIn: boolean;
    visible: boolean;
    senderUid: string;
}

const EMPTY: ListDraft = { name: "", publicName: "", description: "", publicDescription: "", doubleOptIn: false, visible: true, senderUid: "" };

function draftOf(list: MailingList): ListDraft {
    return {
        name: list.name,
        publicName: list.publicName,
        description: list.description ?? "",
        publicDescription: list.publicDescription ?? "",
        doubleOptIn: list.doubleOptIn,
        visible: list.visible,
        senderUid: list.senderUid ?? "",
    };
}

/**
 * A workspace's mailing lists: how many are subscribed and waiting to confirm, a link to each list's subscribers, and (for admins)
 * creating, changing and deleting lists.
 */
export default function ListManager() {
    const { workspace, canManage, href } = useCrm();
    const [lists, setLists] = useState<MailingList[]>([]);
    const [senders, setSenders] = useState<WorkspaceSender[]>([]);
    const [editing, setEditing] = useState<MailingList | "new" | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function load(): Promise<void> {
        try {
            setLists(await listLists(workspace.uid));
        } catch (err) {
            setError(errorMessage(err, "Could not load the lists."));
        }
    }

    useEffect(() => {
        void load();
        listSenders(workspace.uid)
            .then(setSenders)
            .catch(() => setSenders([]));
    }, [workspace.uid]);

    async function remove(list: MailingList): Promise<void> {
        if (!window.confirm(`Delete the list "${list.name}"? Its ${list.subscribedCount} subscriptions go with it.`)) {
            return;
        }
        try {
            await deleteList(workspace.uid, list.uid);
            await load();
        } catch (err) {
            setError(errorMessage(err, "Could not delete the list."));
        }
    }

    return (
        <div className="max-w-5xl">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-lg font-bold tracking-tight">Lists</h1>
                {canManage && (
                    <Button type="button" className="!w-auto" onClick={() => setEditing("new")}>
                        + New list
                    </Button>
                )}
            </div>
            {error && <Alert>{error}</Alert>}
            {lists.length === 0 ? (
                <p className="text-sm text-text-muted">No lists yet.</p>
            ) : (
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr>
                            {["Name", "Subscribed", "Awaiting confirmation", "Double opt-in", ""].map((heading) => (
                                <th key={heading} className="text-left text-xs uppercase tracking-wide text-text-muted py-2 px-2.5 border-b border-border">
                                    {heading}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {lists.map((list) => (
                            <tr key={list.uid}>
                                <td className="py-2 px-2.5 border-b border-border">
                                    <span className="font-medium">{list.name}</span>
                                    {!list.visible && <span className="ml-2 text-xs text-text-muted">hidden from subscribers</span>}
                                </td>
                                <td className="py-2 px-2.5 border-b border-border">{list.subscribedCount}</td>
                                <td className="py-2 px-2.5 border-b border-border">{list.pendingCount}</td>
                                <td className="py-2 px-2.5 border-b border-border">{list.doubleOptIn ? "Yes" : "No"}</td>
                                <td className="py-2 px-2.5 border-b border-border text-right whitespace-nowrap">
                                    <a className="text-primary-dark hover:underline font-medium mr-4" href={href(`/crm?list=${encodeURIComponent(list.uid)}`)}>
                                        Subscribers
                                    </a>
                                    {canManage && (
                                        <>
                                            <button type="button" className="text-primary-dark hover:underline font-medium mr-4" onClick={() => setEditing(list)}>
                                                Edit
                                            </button>
                                            <button type="button" className="text-danger hover:underline" onClick={() => void remove(list)}>
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
                <ListForm
                    list={editing === "new" ? undefined : editing}
                    senders={senders}
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

/** The form for a new list, or for changing `list`. */
function ListForm({ list, senders, onClose, onSaved }: { list?: MailingList; senders: WorkspaceSender[]; onClose: () => void; onSaved: () => Promise<void> }) {
    const { workspace } = useCrm();
    const [draft, setDraft] = useState<ListDraft>(list ? draftOf(list) : EMPTY);
    const [error, setError] = useState<string | null>(null);
    const set = (change: Partial<ListDraft>) => setDraft((current) => ({ ...current, ...change }));

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        const body = { ...draft, senderUid: draft.senderUid || null, publicName: draft.publicName || null } as any;
        try {
            if (list) {
                await updateList(workspace.uid, list.uid, body);
            } else {
                await createList(workspace.uid, body);
            }
            await onSaved();
        } catch (err) {
            setError(errorMessage(err, "Could not save the list."));
        }
    }

    const texts: [keyof ListDraft, string][] = [
        ["name", "Name"],
        ["publicName", "Name subscribers see (optional)"],
        ["description", "Description"],
        ["publicDescription", "Description subscribers see"],
    ];
    return (
        <Modal open onClose={onClose} title={list ? "Edit list" : "New list"}>
            <form onSubmit={submit} className="flex flex-col gap-3">
                {error && <Alert>{error}</Alert>}
                {texts.map(([field, label]) => (
                    <FormField key={field} label={label} htmlFor={`list-${field}`}>
                        <input id={`list-${field}`} className={INPUT_CLASS} value={draft[field] as string} onChange={(event) => set({ [field]: event.target.value })} />
                    </FormField>
                ))}
                <label className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={draft.visible} onChange={(event) => set({ visible: event.target.checked })} />
                    Offer it in the preference center
                </label>
                <label className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={draft.doubleOptIn} onChange={(event) => set({ doubleOptIn: event.target.checked })} />
                    Ask signups to confirm by email (double opt-in)
                </label>
                <FormField label="Confirmation emails come from" htmlFor="list-sender">
                    <select id="list-sender" className={INPUT_CLASS} value={draft.senderUid} onChange={(event) => set({ senderUid: event.target.value })}>
                        <option value="">Nobody</option>
                        {senders.map((sender) => (
                            <option key={sender.uid} value={sender.uid}>
                                {sender.fromName} &lt;{sender.fromAddress}&gt;
                            </option>
                        ))}
                    </select>
                </FormField>
                <Button type="submit" className="!w-auto self-end">
                    Save
                </Button>
            </form>
        </Modal>
    );
}
