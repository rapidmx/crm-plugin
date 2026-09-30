///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useMemo, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import TimeZonePicker from "@rapidmx/web-client/lib/components/pickers/TimeZonePicker.js";
import { timeZoneOptions } from "@rapidmx/web-client/lib/util/timeZone.js";
import { listMailboxes } from "@rapidmx/web-client/lib/mail/mailApi.js";
import { RecipientSuggestion, searchDirectory } from "@rapidmx/web-client/lib/mail/directoryApi.js";
import RecipientInput from "@rapidmx/web-client/shared/components/mail/compose/RecipientInput.js";
import {
    CrmObjectType,
    PropertyDefinition,
    PropertyType,
    SendableMailbox,
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
    sendableMailboxes,
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

    const fields: [Exclude<keyof typeof values, "timezone">, string][] = [
        ["name", "Name"],
        ["description", "Description"],
        ["postalAddress", "Postal address (shown in marketing email footers)"],
        ["website", "Website"],
    ];
    const zones: string[] = useMemo(() => timeZoneOptions(workspace.timezone), [workspace.timezone]);
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
            <FormField label="Time zone" htmlFor="workspace-timezone">
                {canManage ? (
                    <TimeZonePicker id="workspace-timezone" value={values.timezone} zones={zones} onChange={(timezone) => setValues((current) => ({ ...current, timezone }))} />
                ) : (
                    <input id="workspace-timezone" className={INPUT_CLASS} value={values.timezone} disabled />
                )}
            </FormField>
            {canManage && (
                <Button type="submit" className="!w-auto self-start">
                    Save
                </Button>
            )}
        </form>
    );
}

/** The address of an entry of the people field: `Name <address>` or a bare address. */
export function chipAddress(chip: string): string {
    const match: RegExpExecArray | null = /<([^<>]+)>\s*$/.exec(chip);
    return (match ? match[1] : chip).trim().toLowerCase();
}

/** Suggests only people with an account on this server - the only ones who can be members. */
export async function suggestPeople(query: string, options: { limit?: number; signal?: AbortSignal }): Promise<RecipientSuggestion[]> {
    return (await searchDirectory(query, options)).filter((suggestion) => suggestion.kind === "user");
}

function Members() {
    const { workspace, canManage } = useCrm();
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [text, setText] = useState("");
    const [people, setPeople] = useState<{ chips: string[]; pending: string }>({ chips: [], pending: "" });
    const [role, setRole] = useState<WorkspaceRole>("editor");
    const [error, setError] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);

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

    /** Adds everyone in the field; those that fail stay in it, with why. */
    async function add(event: FormEvent): Promise<void> {
        event.preventDefault();
        const entries: string[] = [...people.chips, ...(people.pending.trim() ? [people.pending.trim()] : [])];
        setAdding(true);
        const failed: string[] = [];
        const reasons: string[] = [];
        for (const entry of entries) {
            try {
                await addMember(workspace.uid, { address: chipAddress(entry), role });
            } catch (err) {
                failed.push(entry);
                reasons.push(`${chipAddress(entry)}: ${errorMessage(err, "could not be added.")}`);
            }
        }
        setText(failed.join(", "));
        setPeople({ chips: failed, pending: "" });
        setAdding(false);
        try {
            await load();
            setError(reasons.length > 0 ? reasons.join(" ") : null);
        } catch (err) {
            setError([...reasons, errorMessage(err, "Could not load the members.")].join(" "));
        }
    }

    const count: number = people.chips.length + (people.pending.trim() ? 1 : 0);
    return (
        <section aria-label="Members" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Members</h2>
            {error && <Alert>{error}</Alert>}
            <ul className="flex flex-col divide-y divide-border border-y border-border">
                {members.map((member) => {
                    const name: string = member.displayName || member.address || member.userUid;
                    return (
                        <li key={member.userUid} className="flex items-center gap-3 py-2 text-sm">
                            <span className="flex-1 min-w-0">
                                <span className="block truncate">{name}</span>
                                {member.displayName && member.address && <span className="block truncate text-xs text-text-muted">{member.address}</span>}
                            </span>
                            {canManage ? (
                                <select
                                    aria-label={`Role of ${name}`}
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
                    );
                })}
            </ul>
            {canManage && (
                <form className="flex flex-wrap items-start gap-2" aria-label="Add members" onSubmit={(event) => void add(event)}>
                    <div className="flex-1 min-w-[18rem]">
                        <RecipientInput
                            id="crm-new-members"
                            label="People"
                            ariaLabel="People to add"
                            placeholder="Search people by name or address"
                            value={text}
                            onChange={setText}
                            onEdit={(chips, pending) => setPeople({ chips, pending })}
                            fetchSuggestions={suggestPeople}
                            className={INPUT_CLASS}
                        />
                    </div>
                    <select aria-label="New member role" className={`${INPUT_CLASS} !w-32`} value={role} onChange={(event) => setRole(event.target.value as WorkspaceRole)}>
                        {ROLES.map((entry) => (
                            <option key={entry.value} value={entry.value}>
                                {entry.label}
                            </option>
                        ))}
                    </select>
                    <Button type="submit" variant="secondary" loading={adding} disabled={adding || count === 0} className="!w-auto">
                        {count > 1 ? `Add ${count} members` : "Add member"}
                    </Button>
                </form>
            )}
        </section>
    );
}

function Senders() {
    const { workspace, canManage } = useCrm();
    const [senders, setSenders] = useState<WorkspaceSender[]>([]);
    const [mailboxes, setMailboxes] = useState<SendableMailbox[] | null>(null);
    const [mailboxUid, setMailboxUid] = useState("");
    const [fromName, setFromName] = useState("");
    const [error, setError] = useState<string | null>(null);

    async function load(): Promise<void> {
        setSenders(await listSenders(workspace.uid));
    }

    useEffect(() => {
        load().catch((err) => setError(errorMessage(err, "Could not load the senders.")));
    }, [workspace.uid]);

    useEffect(() => {
        if (!canManage) {
            return;
        }
        (async () => {
            const own = await listMailboxes({ limit: 200 });
            setMailboxes(own.length > 0 ? await sendableMailboxes(workspace.uid, own.map((mailbox) => mailbox.uid)) : []);
        })().catch(() => setMailboxes([]));
    }, [workspace.uid, canManage]);

    const choices: SendableMailbox[] = (mailboxes ?? []).filter((mailbox) => !senders.some((sender) => sender.fromAddress === mailbox.address));
    const chosen: SendableMailbox | undefined = choices.find((mailbox) => mailbox.uid === mailboxUid);

    async function add(event: FormEvent): Promise<void> {
        event.preventDefault();
        try {
            await addSender(workspace.uid, { fromAddress: chosen!.address, ...(fromName.trim() ? { fromName: fromName.trim() } : {}) });
            setMailboxUid("");
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
            <p className="text-sm text-text-muted">Mailboxes the CRM sends from. Replies to mail sent from the CRM arrive in these mailboxes.</p>
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
            {canManage && mailboxes !== null && mailboxes.length === 0 && (
                <p className="text-sm text-text-muted">You have no mailbox you can send from. Its owner can add it, or give you send access to it.</p>
            )}
            {canManage && choices.length > 0 && (
                <form className="flex flex-wrap gap-2" aria-label="Add sender" onSubmit={(event) => void add(event)}>
                    <select
                        aria-label="Mailbox"
                        className={`${INPUT_CLASS} !w-72`}
                        value={mailboxUid}
                        onChange={(event) => {
                            setMailboxUid(event.target.value);
                            setFromName(choices.find((mailbox) => mailbox.uid === event.target.value)?.displayName ?? "");
                        }}
                    >
                        <option value="">Choose a mailbox…</option>
                        {choices.map((mailbox) => (
                            <option key={mailbox.uid} value={mailbox.uid}>
                                {mailbox.displayName ? `${mailbox.displayName} <${mailbox.address}>` : mailbox.address}
                            </option>
                        ))}
                    </select>
                    <input aria-label="Sender name" placeholder="Name shown to recipients" className={`${INPUT_CLASS} !w-56`} value={fromName} onChange={(event) => setFromName(event.target.value)} />
                    <Button type="submit" variant="secondary" disabled={!chosen} className="!w-auto">
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
