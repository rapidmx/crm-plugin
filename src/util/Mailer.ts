///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type { MailTransport } from "@rapidmx/restapi";
import type { WorkspaceSender } from "../models/types.js";

/** One message the CRM sends itself (not a campaign): a confirmation, a notification. */
export interface SystemMessage {
    sender: Pick<WorkspaceSender, "fromAddress" | "fromName" | "replyToAddress">;
    to: string;
    subject: string;
    text: string;
    html: string;
    headers?: Record<string, string>;
}

/** Escapes text for HTML. */
export function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** A small, complete HTML email: a heading, paragraphs, and an optional button link. Everything given is escaped. */
export function simpleHtml(heading: string, paragraphs: string[], button?: { label: string; href: string }): string {
    const body: string[] = [`<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>`];
    for (const paragraph of paragraphs) {
        body.push(`<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(paragraph)}</p>`);
    }
    if (button) {
        body.push(
            `<p style="margin:20px 0"><a href="${escapeHtml(button.href)}" style="background:#2563eb;color:#ffffff;padding:10px 18px;border-radius:4px;text-decoration:none;display:inline-block">${escapeHtml(button.label)}</a></p>`,
        );
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;margin:0;padding:24px">${body.join("")}</body></html>`;
}

/** Composes `message` as `multipart/alternative` MIME. */
export async function composeMessage(message: SystemMessage): Promise<Buffer> {
    return await new MailComposer({
        from: { name: message.sender.fromName, address: message.sender.fromAddress },
        replyTo: message.sender.replyToAddress || undefined,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: message.headers,
    })
        .compile()
        .build();
}

/** Sends `message` through the server's mail transport, from its sender's address. Throws when the transport accepts no recipient. */
export async function sendSystemMessage(transport: MailTransport, message: SystemMessage): Promise<void> {
    const result = await transport.send({ raw: await composeMessage(message), envelopeFrom: message.sender.fromAddress, envelopeTo: [message.to] });
    if (result.accepted.length === 0) {
        throw new Error(`The mail transport refused the message to ${message.to}.`);
    }
}
