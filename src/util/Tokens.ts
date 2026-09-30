///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import * as crypto from "crypto";

/** What a token lets its bearer do. */
export type TokenPurpose = "prefs" | "confirm" | "unsub";

/** What a signed token says. */
export interface TokenPayload {
    /** The purpose - a token is only accepted for its own. */
    p: TokenPurpose;
    /** The workspace. */
    w: string;
    /** The contact. */
    c: string;
    /** The lists it concerns (a confirmation's lists; an unsubscribe link's lists - none: every list). */
    l?: string[];
    /** The outbound message an unsubscribe link came in, so the unsubscribe counts in its campaign's statistics. */
    s?: string;
    /** When it stops working, in seconds since the epoch. None: it doesn't. */
    x?: number;
}

/** The longest token accepted, so a huge string is refused before any work. */
export const MAX_TOKEN_LENGTH = 2048;

function base64url(data: Buffer | string): string {
    return Buffer.from(data).toString("base64url");
}

function mac(secret: string, body: string): string {
    return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

/**
 * A token carrying `payload`, signed with `secret` (HMAC-SHA256): `<base64url JSON>.<base64url MAC>`. The link in every email a
 * contact gets carries one, so the preference center and one-click unsubscribe work without an account - and without the link's
 * contact or workspace being guessable or changeable.
 */
export function signToken(payload: TokenPayload, secret: string): string {
    const body: string = base64url(JSON.stringify(payload));
    return `${body}.${mac(secret, body)}`;
}

/**
 * The payload of a token signed with `secret` for `purpose`, or `undefined` for anything else: malformed, forged, for another
 * purpose, or expired. The signature is compared in constant time.
 */
export function verifyToken(token: unknown, secret: string, purpose: TokenPurpose, now: Date = new Date()): TokenPayload | undefined {
    if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
        return undefined;
    }
    const dot: number = token.indexOf(".");
    if (dot <= 0 || dot !== token.lastIndexOf(".")) {
        return undefined;
    }
    const body: string = token.slice(0, dot);
    const expected: Buffer = Buffer.from(mac(secret, body));
    const given: Buffer = Buffer.from(token.slice(dot + 1));
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
        return undefined;
    }
    let payload: TokenPayload;
    try {
        payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    } catch {
        return undefined;
    }
    if (
        payload?.p !== purpose ||
        typeof payload.w !== "string" ||
        typeof payload.c !== "string" ||
        (payload.l !== undefined && (!Array.isArray(payload.l) || payload.l.some((uid) => typeof uid !== "string"))) ||
        (payload.s !== undefined && typeof payload.s !== "string") ||
        (payload.x !== undefined && (typeof payload.x !== "number" || payload.x * 1000 < now.getTime()))
    ) {
        return undefined;
    }
    return payload;
}
