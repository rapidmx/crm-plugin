///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import Modal from "@rapidmx/web-client/lib/components/overlays/Modal.js";
import { WorkspaceSender, errorMessage, sendTestTemplate } from "../../crmApi.js";
import { INPUT_CLASS } from "../CrmShell.js";

export interface TestSendModalProps {
    open: boolean;
    onClose: () => void;
    workspaceUid: string;
    templateUid: string;
    senders: WorkspaceSender[];
}

/** Sends the saved template, filled in for a sample reader, to one of the caller's own addresses. */
export default function TestSendModal({ open, onClose, workspaceUid, templateUid, senders }: TestSendModalProps) {
    const [to, setTo] = useState("");
    const [senderUid, setSenderUid] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState<string | null>(null);
    const chosenSender: string = senderUid || senders[0]?.uid || "";

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setSending(true);
        setError(null);
        setSent(null);
        try {
            setSent((await sendTestTemplate(workspaceUid, templateUid, { to: to.trim(), senderUid: chosenSender })).sent);
        } catch (err) {
            setError(errorMessage(err, "Could not send the test."));
        }
        setSending(false);
    }

    return (
        <Modal open={open} onClose={onClose} title="Send a test">
            {senders.length === 0 ? (
                <p className="text-sm text-text-muted">Add a sender in the workspace settings first.</p>
            ) : (
                <form onSubmit={submit} className="flex flex-col gap-3 min-w-[20rem]">
                    <p className="text-sm text-text-muted">A test goes to the address of a mailbox you can read, filled in for a sample reader.</p>
                    {error && <Alert>{error}</Alert>}
                    {sent && (
                        <p role="status" className="text-sm text-success">
                            Sent to {sent}.
                        </p>
                    )}
                    <FormField label="To" htmlFor="crm-test-to">
                        <input id="crm-test-to" type="email" className={INPUT_CLASS} value={to} onChange={(event) => setTo(event.target.value)} required />
                    </FormField>
                    <FormField label="From" htmlFor="crm-test-from">
                        <select id="crm-test-from" className={INPUT_CLASS} value={chosenSender} onChange={(event) => setSenderUid(event.target.value)}>
                            {senders.map((sender) => (
                                <option key={sender.uid} value={sender.uid}>
                                    {sender.fromName ? `${sender.fromName} <${sender.fromAddress}>` : sender.fromAddress}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <Button type="submit" loading={sending} disabled={sending || to.trim() === ""} className="!w-auto self-start">
                        Send test
                    </Button>
                </form>
            )}
        </Modal>
    );
}
