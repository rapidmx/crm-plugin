///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import Modal from "@rapidmx/web-client/lib/components/overlays/Modal.js";
import { Automation, createAutomation, deleteAutomation, errorMessage, listAutomations } from "../../crmApi.js";
import { INPUT_CLASS, useCrm } from "../CrmShell.js";
import { RECIPES } from "./flowModel.js";

const STATUS_LABELS: Record<string, string> = { draft: "Draft", active: "Active", paused: "Paused" };

/** A workspace's automations: their state, and creating (from a recipe) and deleting them. */
export default function AutomationList() {
    const { workspace, canWrite, href } = useCrm();
    const [automations, setAutomations] = useState<Automation[]>([]);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function load(): Promise<void> {
        try {
            setAutomations(await listAutomations(workspace.uid));
        } catch (err) {
            setError(errorMessage(err, "Could not load the automations."));
        }
    }

    useEffect(() => {
        void load();
    }, [workspace.uid]);

    async function remove(automation: Automation): Promise<void> {
        if (!window.confirm(`Delete the automation "${automation.name}"? Contacts in it leave it, and emails not sent yet aren't.`)) {
            return;
        }
        try {
            await deleteAutomation(workspace.uid, automation.uid);
            await load();
        } catch (err) {
            setError(errorMessage(err, "Could not delete the automation."));
        }
    }

    return (
        <div className="max-w-5xl">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-lg font-bold tracking-tight">Automations</h1>
                {canWrite && (
                    <Button type="button" className="!w-auto" onClick={() => setCreating(true)}>
                        + New automation
                    </Button>
                )}
            </div>
            {error && <Alert>{error}</Alert>}
            {automations.length === 0 ? (
                <p className="text-sm text-text-muted">No automations yet. An automation reacts to what contacts do - welcoming subscribers, following up, tagging and assigning leads.</p>
            ) : (
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr>
                            {["Name", "Status", "Published", ""].map((heading) => (
                                <th key={heading} className="text-left text-xs uppercase tracking-wide text-text-muted py-2 px-2.5 border-b border-border">
                                    {heading}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {automations.map((automation) => (
                            <tr key={automation.uid}>
                                <td className="py-2 px-2.5 border-b border-border">
                                    <a className="font-medium text-primary-dark hover:underline" href={href(`/crm/automations/${encodeURIComponent(automation.uid)}`)}>
                                        {automation.name}
                                    </a>
                                    {automation.description && <div className="text-xs text-text-muted">{automation.description}</div>}
                                </td>
                                <td className="py-2 px-2.5 border-b border-border">{STATUS_LABELS[automation.status]}</td>
                                <td className="py-2 px-2.5 border-b border-border whitespace-nowrap">{automation.publishedAt ? new Date(automation.publishedAt).toLocaleString() : "–"}</td>
                                <td className="py-2 px-2.5 border-b border-border text-right">
                                    {canWrite && (
                                        <button type="button" className="text-danger hover:underline" onClick={() => void remove(automation)}>
                                            Delete
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <NewAutomationModal
                open={creating}
                onClose={() => setCreating(false)}
                onCreated={(automation) => window.location.assign(href(`/crm/automations/${encodeURIComponent(automation.uid)}`))}
            />
        </div>
    );
}

/** Asks for a new automation's name and what to start from. */
function NewAutomationModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (automation: Automation) => void }) {
    const { workspace } = useCrm();
    const [name, setName] = useState("");
    const [recipe, setRecipe] = useState(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setSaving(true);
        try {
            onCreated(await createAutomation(workspace.uid, { name: name.trim(), graph: RECIPES[recipe].graph }));
        } catch (err) {
            setError(errorMessage(err, "Could not create the automation."));
            setSaving(false);
        }
    }

    return (
        <Modal open={open} onClose={onClose} title="New automation">
            <form onSubmit={submit} className="flex flex-col gap-3 min-w-[28rem]">
                {error && <Alert>{error}</Alert>}
                <FormField label="Name" htmlFor="crm-automation-name">
                    <input id="crm-automation-name" className={INPUT_CLASS} value={name} onChange={(event) => setName(event.target.value)} required />
                </FormField>
                <fieldset className="flex flex-col gap-2">
                    <legend className="text-xs font-semibold text-text-muted mb-1">Start from</legend>
                    {RECIPES.map((entry, index) => (
                        <label key={entry.name} className="flex items-start gap-2 text-sm">
                            <input type="radio" name="crm-automation-recipe" className="mt-1" checked={recipe === index} onChange={() => setRecipe(index)} />
                            <span>
                                <span className="font-medium">{entry.name}</span>
                                <span className="block text-xs text-text-muted">{entry.description}</span>
                            </span>
                        </label>
                    ))}
                </fieldset>
                <Button type="submit" loading={saving} disabled={saving || !name.trim()} className="!w-auto self-start">
                    Create
                </Button>
            </form>
        </Modal>
    );
}
