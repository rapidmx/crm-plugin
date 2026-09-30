///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Modal from "@rapidmx/web-client/lib/components/overlays/Modal.js";
import { Contact, RenderedEmail, TemplateDesign, errorMessage, renderTemplate, searchRecords } from "../../crmApi.js";
import { INPUT_CLASS } from "../CrmShell.js";

export interface PreviewModalProps {
    open: boolean;
    onClose: () => void;
    workspaceUid: string;
    design: TemplateDesign;
    subject: string;
    preheader: string;
}

type View = "desktop" | "mobile" | "text";

/**
 * The email as a reader gets it, rendered by the server (MJML and merge tags) for a made-up reader or a chosen contact: the subject, and
 * the email at desktop or phone width - in a sandboxed frame that runs no scripts - or its plain-text part.
 */
export default function PreviewModal({ open, onClose, workspaceUid, design, subject, preheader }: PreviewModalProps) {
    const [view, setView] = useState<View>("desktop");
    const [contactUid, setContactUid] = useState("");
    const [query, setQuery] = useState("");
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [email, setEmail] = useState<RenderedEmail | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            return;
        }
        let current = true;
        setError(null);
        renderTemplate(workspaceUid, { design, subject, preheader: preheader || undefined, contactUid: contactUid || undefined }).then(
            (rendered) => current && setEmail(rendered),
            (err) => {
                if (current) {
                    setEmail(null);
                    setError(errorMessage(err, "Could not render the preview."));
                }
            },
        );
        return () => {
            current = false;
        };
    }, [open, contactUid]);

    async function findContacts(): Promise<void> {
        try {
            setContacts((await searchRecords<Contact>("contact", workspaceUid, { q: query, limit: 10 })).items);
        } catch (err) {
            setError(errorMessage(err, "Could not search the contacts."));
        }
    }

    return (
        <Modal open={open} onClose={onClose} title="Preview">
            <div className="flex flex-wrap items-end gap-2 mb-3">
                <div role="radiogroup" aria-label="View" className="flex rounded-sm border border-border overflow-hidden">
                    {(["desktop", "mobile", "text"] as View[]).map((option) => (
                        <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={view === option}
                            onClick={() => setView(option)}
                            className={`px-3 py-1 text-sm capitalize ${view === option ? "bg-primary-lightest text-primary-dark font-semibold" : "text-text"}`}
                        >
                            {option === "text" ? "Plain text" : option}
                        </button>
                    ))}
                </div>
                <form
                    className="flex gap-1 ml-auto"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void findContacts();
                    }}
                >
                    <input aria-label="Find a contact" placeholder="Preview as contact…" className={`${INPUT_CLASS} !w-44`} value={query} onChange={(event) => setQuery(event.target.value)} />
                    <select aria-label="Preview as" className={`${INPUT_CLASS} !w-48`} value={contactUid} onChange={(event) => setContactUid(event.target.value)}>
                        <option value="">A sample reader</option>
                        {contacts.map((contact) => (
                            <option key={contact.uid} value={contact.uid}>
                                {contact.email}
                            </option>
                        ))}
                    </select>
                </form>
            </div>
            {error && <Alert>{error}</Alert>}
            {email && (
                <>
                    <p className="text-sm mb-2">
                        <span className="text-text-muted">Subject: </span>
                        <span className="font-semibold">{email.subject}</span>
                    </p>
                    {view === "text" ? (
                        <pre className="text-xs whitespace-pre-wrap border border-border rounded-sm p-3 max-h-[60vh] overflow-auto">{email.text}</pre>
                    ) : (
                        <iframe
                            title="Email preview"
                            sandbox=""
                            srcDoc={email.html}
                            className="block mx-auto border border-border rounded-sm bg-white"
                            style={{ width: view === "mobile" ? 375 : "100%", minWidth: view === "mobile" ? 375 : 640, height: "60vh" }}
                        />
                    )}
                </>
            )}
        </Modal>
    );
}
