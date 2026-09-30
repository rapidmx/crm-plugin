///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import * as crypto from "crypto";

/** A new outbound message token: 16 random bytes, base64url (22 characters). */
export function newSendToken(): string {
    return crypto.randomBytes(16).toString("base64url");
}

/** What a send token looks like, for refusing anything else before a database lookup. */
export const SEND_TOKEN = /^[A-Za-z0-9_-]{22}$/;

function clickMac(secret: string, token: string, index: number, url: string): string {
    return crypto.createHmac("sha256", secret).update(`click|${token}|${index}|${url}`).digest("base64url");
}

/**
 * The path of a tracked link: `/t/c/<token>/<index>?u=<url>&s=<signature>`. The destination travels in the link (merge tags can make
 * every recipient's different), signed so the redirect only ever goes where the email said - never an open redirect.
 */
export function clickPath(secret: string, token: string, index: number, url: string): string {
    return `/t/c/${token}/${index}?u=${encodeURIComponent(url)}&s=${clickMac(secret, token, index, url)}`;
}

/** Whether `signature` is `clickPath()`'s for this link. Compared in constant time. */
export function verifyClick(secret: string, token: string, index: number, url: string, signature: unknown): boolean {
    if (typeof signature !== "string") {
        return false;
    }
    const expected: Buffer = Buffer.from(clickMac(secret, token, index, url));
    const given: Buffer = Buffer.from(signature);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** A transparent 1x1 GIF, the open-tracking image. */
export const TRACKING_PIXEL: Buffer = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** User agents of mail servers, security scanners and link previewers that fetch images and links nobody looked at. */
const MACHINE_AGENTS = /bot|crawler|spider|preview|scanner|barracuda|mimecast|proofpoint|symantec|trendmicro|forcepoint|messagelabs|python|curl|wget|go-http|java\//i;

/** How soon after sending an open or click is taken as automatic (a server fetching everything on arrival). */
export const MACHINE_WINDOW_MS = 2000;

/**
 * Whether an open or click looks automatic rather than a person's: a known scanner or previewer, no user agent, or within
 * `MACHINE_WINDOW_MS` of sending. Apple Mail Privacy Protection and Gmail's image proxy fetch images for their users, so their opens
 * count - but are never proof of reading.
 */
export function isMachine(userAgent: string | undefined, sentAt: Date | undefined, now: Date = new Date()): boolean {
    if (!userAgent || MACHINE_AGENTS.test(userAgent)) {
        return true;
    }
    return sentAt !== undefined && now.getTime() - new Date(sentAt).getTime() < MACHINE_WINDOW_MS;
}

/** `&amp;` and the other entities an `href` attribute holds, decoded - the URL a mail client follows. */
function decodeAttribute(value: string): string {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&#x27;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

function encodeAttribute(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * `html` with the `href` of each `http(s)` link replaced by `rewrite(url, index)` - `index` counting the rewritten links from 0 in
 * order. Links in `keep` (the unsubscribe and preference links, which must work however tracking goes), `mailto:`/`tel:` links and
 * anything else stay as they are. Returns the HTML and the URLs, in index order.
 */
export function trackLinks(html: string, rewrite: (url: string, index: number) => string, keep: ReadonlySet<string>): { html: string; urls: string[] } {
    const urls: string[] = [];
    const rewritten: string = html.replace(/(<a\b[^>]*?\shref=)(["'])(.*?)\2/gi, (whole, prefix: string, quote: string, raw: string) => {
        const url: string = decodeAttribute(raw.trim());
        if (!/^https?:\/\//i.test(url) || keep.has(url)) {
            return whole;
        }
        urls.push(url);
        return `${prefix}${quote}${encodeAttribute(rewrite(url, urls.length - 1))}${quote}`;
    });
    return { html: rewritten, urls };
}

/** `html` with the open-tracking image `src` added at the end of its body. */
export function addOpenPixel(html: string, src: string): string {
    const pixel: string = `<img src="${encodeAttribute(src)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;overflow:hidden" />`;
    const close: number = html.toLowerCase().lastIndexOf("</body>");
    return close >= 0 ? `${html.slice(0, close)}${pixel}${html.slice(close)}` : `${html}${pixel}`;
}

/** The longest local part an address may have (RFC 5321). */
const MAX_LOCAL_PART = 64;

/**
 * The bounce address (VERP) of one message: `<local>+b-<token>@<domain>` of the sender's address, so a bounce comes back to the
 * sender's mailbox (by plus-addressing) naming the message it is about. The plain address when that would be too long.
 */
export function verpAddress(fromAddress: string, token: string): string {
    const at: number = fromAddress.lastIndexOf("@");
    const local: string = `${fromAddress.slice(0, at)}+b-${token}`;
    return local.length > MAX_LOCAL_PART ? fromAddress : `${local}${fromAddress.slice(at)}`;
}

/** The send token of a bounce address `verpAddress()` made, if `address` is one. */
export function tokenFromVerp(address: string): string | undefined {
    return /\+b-([A-Za-z0-9_-]{22})@/.exec(address)?.[1];
}
