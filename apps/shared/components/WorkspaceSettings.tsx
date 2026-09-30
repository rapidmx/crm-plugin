///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import {
    CrmObjectType,
    PropertyDefinition,
    PropertyType,
    WorkspaceMember,
    WorkspaceRole,
    WorkspaceSender,
    addMember,
    addSender,
    createProperty,
    createSuppression,
    deleteSuppression,
    listSuppressions,
    Suppression,
    deleteProperty,
    deleteWorkspace,
    errorMessage,
    listMembers,
    listProperties,
    listSenders,
    removeMember,
    removeSender,
    updateMember,
    updateWorkspace,
    updateSender,
} from "../crmApi.js";
import { INPUT_CLASS, WORKSPACE_STORAGE_KEY, useCrm } from "./CrmShell.js";

const ROLES: { value: WorkspaceRole; label: string }[] = [
    { value: "owner", label: "Owner" },
    { value: "admin", label: "Admin" },
    { value: "editor", label: "Editor" },
    { value: "viewer", label: "Viewer" },
];

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
    { value: "text", label: "Text" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "boolean", label: "Yes / no" },
    { value: "select", label: "Dropdown" },
    { value: "multi_select", label: "Multiple choice" },
];

/**
 * A workspace's settings: its details, members and their roles, the addresses it sends as, and its custom properties - changeable by
 * its admins and owners (everyone else sees them read-only) - and, for owners, deleting it.
 */
export default function WorkspaceSettings() {
    const { workspace, canManage } = useCrm();
    return (
        <div className="max-w-3xl flex flex-col gap-10">
            <h1 className="text-lg font-bold tracking-tight">Settings</h1>
            <Details />
            <Members />
            <Senders />
            <Properties />
            <Suppressions />
            {workspace.role === "owner" && canManage && <DangerZone />}
        </div>
    );
}

function Details() {
    const { workspace, canManage, reload } = useCrm();
    const [values, setValues] = useState({
        name: workspace.name,
        description: workspace.description ?? "",
        timezone: workspace.timezone,
        postalAddress: workspace.postalAddress ?? "",
        website: workspace.website ?? "",
    });
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function save(event: FormEvent): Promise<void> {
        event.preventDefault();
        try {
            await updateWorkspace(workspace.uid, values);
            setMessage("Saved.");
            setError(null);
            await reload();
        } catch (err) {
            setError(errorMessage(err, "Could not save the workspace."));
        }
    }

    const fields: [keyof typeof values, string][] = [
        ["name", "Name"],
        ["description", "Description"],
        ["timezone", "Time zone"],
        ["postalAddress", "Postal address (shown in marketing email footers)"],
        ["website", "Website"],
    ];
    return (
        <form onSubmit={save} className="flex flex-col gap-3" aria-label="Workspace details">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Workspace</h2>
            {error && <Alert>{error}</Alert>}
            {message && <p className="text-sm text-success">{message}</p>}
            {fields.map(([field, label]) => (
                <FormField key={field} label={label} htmlFor={`workspace-${field}`}>
                    <input
                        id={`workspace-${field}`}
                        className={INPUT_CLASS}
                        value={values[field]}
                        disabled={!canManage}
                        onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}
                    />
                </FormField>
            ))}
            {canManage && (
                <Button type="submit" className="!w-auto self-start">
                    Save
                </Button>
            )}
        </form>
    );
}

function Members() {
    const { workspace, canManage } = useCrm();
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [address, setAddress] = useState("");
    const [role, setRole] = useState<WorkspaceRole>("editor");
    const [error, setError] = useState<string | null>(null);

    async function load(): Promise<void> {
        setMembers(await listMembers(workspace.uid));
    }

    useEffect(() => {
        load().catch((err) => setError(errorMessage(err, "Could not load the members.")));
    }, [workspace.uid]);

    async function act(action: () => Promise<unknown>, failure: string): Promise<void> {
        try {
            await action();
            setError(null);
            await load();
        } catch (err) {
            setError(errorMessage(err, failure));
        }
    }

    return (
        <section aria-label="Members" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Members</h2>
            {error && <Alert>{error}</Alert>}
            <ul className="flex flex-col divide-y divide-border border-y border-border">
                {members.map((member) => (
                    <li key={member.userUid} className="flex items-center gap-3 py-2 text-sm">
                        <span className="flex-1">{member.displayName || member.address || member.userUid}</span>
                        {canManage ? (
                            <select
                                aria-label={`Role of ${member.displayName || member.address || member.userUid}`}
                                className={`${INPUT_CLASS} !w-32`}
                                value={member.role}
                                onChange={(event) => void act(() => updateMember(workspace.uid, member.userUid, event.target.value as WorkspaceRole), "Could not change the role.")}
                            >
                                {ROLES.map((entry) => (
                                    <option key={entry.value} value={entry.value}>
                                        {entry.label}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <span className="text-text-muted">{member.role}</span>
                        )}
                        {canManage && (
                            <button
                                type="button"
                                className="text-xs text-text-muted hover:text-danger"
                                onClick={() => void act(() => removeMember(workspace.uid, member.userUid), "Could not remove the member.")}
                            >
                                Remove
                            </button>
                        )}
                    </li>
                ))}
            </ul>
            {canManage && (
                <form
                    className="flex flex-wrap gap-2"
                    aria-label="Add member"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void act(async () => {
                            await addMember(workspace.uid, { address, role });
                            setAddress("");
                        }, "Could not add the member.");
                    }}
                >
                    <input aria-label="Member address" placeholder="colleague@example.com" className={`${INPUT_CLASS} !w-72`} value={address} onChange={(event) => setAddress(event.target.value)} />
                    <select aria-label="New member role" className={`${INPUT_CLASS} !w-32`} value={role} onChange={(event) => setRole(event.target.value as WorkspaceRole)}>
                        {ROLES.map((entry) => (
                            <option key={entry.value} value={entry.value}>
                                {entry.label}
                            </option>
                        ))}
                    </select>
                    <Button type="submit" variant="secondary" disabled={address.trim() === ""} className="!w-auto">
                        Add member
                    </Button>
                </form>
            )}
        </section>
    );
}

function Senders() {
    const { workspace, canManage } = useCrm();
    const [senders, setSenders] = useState<WorkspaceSender[]>([]);
    const [fromAddress, setFromAddress] = useState("");
    const [fromName, setFromName] = useState("");
    const [error, setError] = useState<string | null>(null);

    async function load(): Promise<void> {
        setSenders(await listSenders(workspace.uid));
    }

    useEffect(() => {
        load().catch((err) => setError(errorMessage(err, "Could not load the senders.")));
    }, [workspace.uid]);

    async function add(event: FormEvent): Promise<void> {
        event.preventDefault();
        try {
            await addSender(workspace.uid, { fromAddress, ...(fromName.trim() ? { fromName } : {}) });
            setFromAddress("");
            setFromName("");
            setError(null);
            await load();
        } catch (err) {
            setError(errorMessage(err, "Could not add the sender."));
        }
    }

    return (
        <section aria-label="Senders" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Send as</h2>
            <p className="text-sm text-text-muted">Addresses of mailboxes you can send from. Replies to mail sent from the CRM arrive in these mailboxes.</p>
            {error && <Alert>{error}</Alert>}
            <ul className="flex flex-col gap-1">
                {senders.map((sender) => (
                    <li key={sender.uid} className="flex items-center gap-3 text-sm">
                        <span className="flex-1">
                            {sender.fromName} &lt;{sender.fromAddress}&gt;
                        </span>
                        <label className="flex items-center gap-1 text-xs text-text-muted" title="Mail this mailbox exchanges with contacts goes on their timelines">
                            <input
                                type="checkbox"
                                disabled={!canManage}
                                checked={!!sender.logEmail}
                                onChange={async (event) => {
                                    try {
                                        await updateSender(workspace.uid, sender.uid, { logEmail: event.target.checked });
                                    } catch (err) {
                                        setError(errorMessage(err, "Could not change the sender."));
                                    }
                                    await load();
                                }}
                            />
                            Log email with contacts
                        </label>
                        {canManage && (
                            <button
                                type="button"
                                className="text-xs text-text-muted hover:text-danger"
                                onClick={async () => {
                                    await removeSender(workspace.uid, sender.uid);
                                    await load();
                                }}
                            >
                                Remove
                            </button>
                        )}
                    </li>
                ))}
            </ul>
            {canManage && (
                <form className="flex flex-wrap gap-2" aria-label="Add sender" onSubmit={add}>
                    <input aria-label="Sender address" placeholder="sales@example.com" className={`${INPUT_CLASS} !w-64`} value={fromAddress} onChange={(event) => setFromAddress(event.target.value)} />
                    <input aria-label="Sender name" placeholder="Name shown to recipients" className={`${INPUT_CLASS} !w-56`} value={fromName} onChange={(event) => setFromName(event.target.value)} />
                    <Button type="submit" variant="secondary" disabled={fromAddress.trim() === ""} className="!w-auto">
                        Add sender
                    </Button>
                </form>
            )}
        </section>
    );
}

function Properties() {
    const { workspace, canManage } = useCrm();
    const [definitions, setDefinitions] = useState<PropertyDefinition[]>([]);
    const [objectType, setObjectType] = useState<CrmObjectType>("contact");
    const [label, setLabel] = useState("");
    const [type, setType] = useState<PropertyType>("text");
    const [options, setOptions] = useState("");
    const [error, setError] = useState<string | null>(null);

    async function load(): Promise<void> {
        setDefinitions(await listProperties(workspace.uid));
    }

    useEffect(() => {
        load().catch((err) => setError(errorMessage(err, "Could not load the properties.")));
    }, [workspace.uid]);

    async function add(event: FormEvent): Promise<void> {
        event.preventDefault();
        const key: string = label
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^[^a-z]+|_+$/g, "")
            .slice(0, 64);
        const isSelect: boolean = type === "select" || type === "multi_select";
        try {
            await createProperty(workspace.uid, {
                objectType,
                key,
                label,
                type,
                ...(isSelect
                    ? {
                          options: options
                              .split(",")
                              .map((entry) => entry.trim())
                              .filter(Boolean),
                      }
                    : {}),
            });
            setLabel("");
            setOptions("");
            setError(null);
            await load();
        } catch (err) {
            setError(errorMessage(err, "Could not add the property."));
        }
    }

    return (
        <section aria-label="Properties" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Custom properties</h2>
            {error && <Alert>{error}</Alert>}
            <ul className="flex flex-col gap-1">
                {definitions.map((definition) => (
                    <li key={definition.uid} className="flex items-center gap-3 text-sm">
                        <span className="flex-1">
                            {definition.label} <span className="text-text-muted">({definition.objectType}, {definition.type})</span>
                        </span>
                        {canManage && (
                            <button
                                type="button"
                                className="text-xs text-text-muted hover:text-danger"
                                onClick={async () => {
                                    if (window.confirm(`Delete "${definition.label}" and every value of it?`)) {
                                        await deleteProperty(workspace.uid, definition.uid);
                                        await load();
                                    }
                                }}
                            >
                                Delete
                            </button>
                        )}
                    </li>
                ))}
            </ul>
            {canManage && (
                <form className="flex flex-wrap gap-2" aria-label="Add property" onSubmit={add}>
                    <select aria-label="Property of" className={`${INPUT_CLASS} !w-32`} value={objectType} onChange={(event) => setObjectType(event.target.value as CrmObjectType)}>
                        <option value="contact">Contacts</option>
                        <option value="company">Companies</option>
                    </select>
                    <input aria-label="Property label" placeholder="Label" className={`${INPUT_CLASS} !w-48`} value={label} onChange={(event) => setLabel(event.target.value)} />
                    <select aria-label="Property type" className={`${INPUT_CLASS} !w-40`} value={type} onChange={(event) => setType(event.target.value as PropertyType)}>
                        {PROPERTY_TYPES.map((entry) => (
                            <option key={entry.value} value={entry.value}>
                                {entry.label}
                            </option>
                        ))}
                    </select>
                    {(type === "select" || type === "multi_select") && (
                        <input aria-label="Property options" placeholder="Options, comma-separated" className={`${INPUT_CLASS} !w-64`} value={options} onChange={(event) => setOptions(event.target.value)} />
                    )}
                    <Button type="submit" variant="secondary" disabled={label.trim() === ""} className="!w-auto">
                        Add property
                    </Button>
                </form>
            )}
        </section>
    );
}

const REASONS: Record<string, string> = { hard_bounce: "bounced", complaint: "marked as spam", manual: "added by hand" };

/** The addresses the workspace never sends marketing mail to. */
function Suppressions() {
    const { workspace, canManage } = useCrm();
    const [entries, setEntries] = useState<Suppression[]>([]);
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(null);

    async function load(): Promise<void> {
        setEntries(await listSuppressions(workspace.uid));
    }

    useEffect(() => {
        load().catch((err) => setError(errorMessage(err, "Could not load the suppression list.")));
    }, [workspace.uid]);

    async function add(event: FormEvent): Promise<void> {
        event.preventDefault();
        try {
            await createSuppression(workspace.uid, { email });
            setEmail("");
            setError(null);
            await load();
        } catch (err) {
            setError(errorMessage(err, "Could not add the address."));
        }
    }

    return (
        <section aria-label="Suppressions" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Do not email</h2>
            <p className="text-sm text-text-muted">Addresses no campaign is ever sent to. Bounces and spam complaints are added here on their own.</p>
            {error && <Alert>{error}</Alert>}
            <ul className="flex flex-col gap-1">
                {entries.map((entry) => (
                    <li key={entry.uid} className="flex items-center gap-3 text-sm">
                        <span className="flex-1">
                            {entry.email} <span className="text-text-muted">({REASONS[entry.reason] ?? entry.reason})</span>
                        </span>
                        {canManage && (
                            <button
                                type="button"
                                className="text-xs text-text-muted hover:text-danger"
                                onClick={async () => {
                                    await deleteSuppression(workspace.uid, entry.uid);
                                    await load();
                                }}
                            >
                                Remove
                            </button>
                        )}
                    </li>
                ))}
            </ul>
            {canManage && (
                <form className="flex flex-wrap gap-2" aria-label="Add suppression" onSubmit={add}>
                    <input aria-label="Suppressed address" placeholder="someone@example.com" className={`${INPUT_CLASS} !w-72`} value={email} onChange={(event) => setEmail(event.target.value)} />
                    <Button type="submit" variant="secondary" disabled={email.trim() === ""} className="!w-auto">
                        Add address
                    </Button>
                </form>
            )}
        </section>
    );
}

function DangerZone() {
    const { workspace } = useCrm();
    const [error, setError] = useState<string | null>(null);
    return (
        <section aria-label="Delete workspace" className="flex flex-col gap-2 border border-danger rounded-sm p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-danger">Delete workspace</h2>
            <p className="text-sm">Deletes the workspace and everything in it, for every member. This can&apos;t be undone.</p>
            {error && <Alert>{error}</Alert>}
            <button
                type="button"
                className="text-sm text-danger font-semibold self-start hover:underline"
                onClick={async () => {
                    if (window.prompt(`Type the workspace's name, ${workspace.name}, to delete it.`) !== workspace.name) {
                        return;
                    }
                    try {
                        await deleteWorkspace(workspace.uid);
                        try {
                            window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
                        } catch {
                            // Storage blocked: nothing was remembered.
                        }
                        window.location.assign("/crm");
                    } catch (err) {
                        setError(errorMessage(err, "Could not delete the workspace."));
                    }
                }}
            >
                Delete this workspace
            </button>
        </section>
    );
}
