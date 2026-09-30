///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import Modal from "@rapidmx/web-client/lib/components/overlays/Modal.js";
import { EmailTemplate, createTemplate, deleteTemplate, duplicateTemplate, errorMessage, searchTemplates } from "../crmApi.js";
import { INPUT_CLASS, useCrm } from "./CrmShell.js";

const PAGE_SIZE = 100;

/** A workspace's email templates, by name: opening one in the designer, creating, duplicating and deleting them. */
export default function TemplateList() {
    const { workspace, canWrite, href } = useCrm();
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [filter, setFilter] = useState("");
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function load(upTo: number): Promise<void> {
        try {
            const pages = await Promise.all(Array.from({ length: upTo + 1 }, (_unused, index) => searchTemplates(workspace.uid, index, PAGE_SIZE)));
            setTemplates(pages.flatMap((result) => result.items));
            setTotal(pages[0].total);
            setPage(upTo);
        } catch (err) {
            setError(errorMessage(err, "Could not load the templates."));
        }
    }

    useEffect(() => {
        void load(0);
    }, [workspace.uid]);

    const open = (template: EmailTemplate) => window.location.assign(href(`/crm/templates/${encodeURIComponent(template.uid)}`));

    async function duplicate(template: EmailTemplate): Promise<void> {
        try {
            open(await duplicateTemplate(workspace.uid, template.uid));
        } catch (err) {
            setError(errorMessage(err, "Could not duplicate the template."));
        }
    }

    async function remove(template: EmailTemplate): Promise<void> {
        if (!window.confirm(`Delete the template "${template.name}"?`)) {
            return;
        }
        try {
            await deleteTemplate(workspace.uid, template.uid);
            await load(page);
        } catch (err) {
            setError(errorMessage(err, "Could not delete the template."));
        }
    }

    const needle: string = filter.trim().toLowerCase();
    const shown: EmailTemplate[] = templates.filter(
        (template) => !needle || [template.name, template.subject, template.category ?? ""].some((text) => text.toLowerCase().includes(needle)),
    );

    return (
        <div className="max-w-5xl">
            <div className="flex items-center justify-between gap-2 mb-4">
                <h1 className="text-lg font-bold tracking-tight">Templates</h1>
                <input aria-label="Filter templates" placeholder="Filter…" className={`${INPUT_CLASS} !w-56 ml-auto`} value={filter} onChange={(event) => setFilter(event.target.value)} />
                {canWrite && (
                    <Button type="button" className="!w-auto" onClick={() => setCreating(true)}>
                        + New template
                    </Button>
                )}
            </div>
            {error && <Alert>{error}</Alert>}
            {shown.length === 0 ? (
                <p className="text-sm text-text-muted">{templates.length === 0 ? "No templates yet." : "No templates match."}</p>
            ) : (
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr>
                            {["Name", "Subject", "Category", "Changed", ""].map((heading) => (
                                <th key={heading} className="text-left text-xs uppercase tracking-wide text-text-muted py-2 px-2.5 border-b border-border">
                                    {heading}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((template) => (
                            <tr key={template.uid}>
                                <td className="py-2 px-2.5 border-b border-border">
                                    <a className="font-medium text-primary-dark hover:underline" href={href(`/crm/templates/${encodeURIComponent(template.uid)}`)}>
                                        {template.name}
                                    </a>
                                    {!template.hasUnsubscribeLink && (
                                        <span className="ml-2 text-xs text-warning" title="Campaigns need a footer or an unsubscribe link.">
                                            no unsubscribe link
                                        </span>
                                    )}
                                </td>
                                <td className="py-2 px-2.5 border-b border-border truncate max-w-xs">{template.subject}</td>
                                <td className="py-2 px-2.5 border-b border-border">{template.category ?? ""}</td>
                                <td className="py-2 px-2.5 border-b border-border whitespace-nowrap">{new Date(template.dateModified).toLocaleDateString()}</td>
                                <td className="py-2 px-2.5 border-b border-border text-right whitespace-nowrap">
                                    {canWrite && (
                                        <>
                                            <button type="button" className="text-primary-dark hover:underline font-medium mr-4" onClick={() => void duplicate(template)}>
                                                Duplicate
                                            </button>
                                            <button type="button" className="text-danger hover:underline" onClick={() => void remove(template)}>
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
            {templates.length < total && (
                <Button type="button" variant="secondary" className="!w-auto mt-3" onClick={() => void load(page + 1)}>
                    Show more
                </Button>
            )}
            <NewTemplateModal open={creating} onClose={() => setCreating(false)} onCreated={open} />
        </div>
    );
}

/** Asks for a new template's name and subject, and creates it from the starter design. */
function NewTemplateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (template: EmailTemplate) => void }) {
    const { workspace } = useCrm();
    const [name, setName] = useState("");
    const [subject, setSubject] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setSaving(true);
        try {
            onCreated(await createTemplate(workspace.uid, { name: name.trim(), subject: subject.trim() }));
        } catch (err) {
            setError(errorMessage(err, "Could not create the template."));
            setSaving(false);
        }
    }

    return (
        <Modal open={open} onClose={onClose} title="New template">
            <form onSubmit={submit} className="flex flex-col gap-3 min-w-[20rem]">
                {error && <Alert>{error}</Alert>}
                <FormField label="Name" htmlFor="crm-template-name">
                    <input id="crm-template-name" className={INPUT_CLASS} value={name} onChange={(event) => setName(event.target.value)} required />
                </FormField>
                <FormField label="Subject" htmlFor="crm-template-new-subject">
                    <input id="crm-template-new-subject" className={INPUT_CLASS} value={subject} onChange={(event) => setSubject(event.target.value)} required />
                </FormField>
                <Button type="submit" loading={saving} disabled={saving || !name.trim() || !subject.trim()} className="!w-auto self-start">
                    Create and design
                </Button>
            </form>
        </Modal>
    );
}
