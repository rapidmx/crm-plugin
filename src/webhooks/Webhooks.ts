///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import * as crypto from "crypto";
import { promises as dns, LookupAddress } from "dns";
import * as https from "https";
import * as net from "net";

/** How long a webhook request may take. */
export const WEBHOOK_TIMEOUT_MS = 10_000;
/** The largest body a webhook posts. */
export const MAX_PAYLOAD_BYTES = 256 * 1024;

/** A new endpoint secret. */
export function newWebhookSecret(): string {
    return `whsec_${crypto.randomBytes(24).toString("base64url")}`;
}

/**
 * The signature header of a webhook body: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">` - the timestamp is signed too, so a
 * receiver can refuse replays.
 */
export function signWebhook(secret: string, body: string, timestamp: number = Math.floor(Date.now() / 1000)): string {
    return `t=${timestamp},v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** An IPv4 address as a 32-bit number. */
function ipv4Number(address: string): number {
    return address.split(".").reduce((value, part) => value * 256 + Number(part), 0);
}

const PRIVATE_V4: [string, number][] = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
];

/**
 * Whether `address` (an IP) is on the public internet: not loopback, private, link-local, carrier-grade NAT, documentation,
 * multicast or reserved - IPv4, IPv6, and IPv4 mapped into IPv6.
 */
export function isPublicAddress(address: string): boolean {
    if (net.isIPv4(address)) {
        const value: number = ipv4Number(address);
        return !PRIVATE_V4.some(([base, bits]) => Math.floor(value / 2 ** (32 - bits)) === Math.floor(ipv4Number(base) / 2 ** (32 - bits)));
    }
    if (!net.isIPv6(address)) {
        return false;
    }
    const lower: string = address.toLowerCase();
    const mapped: RegExpExecArray | null = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) {
        return isPublicAddress(mapped[1]);
    }
    if (lower === "::" || lower === "::1") {
        return false;
    }
    const first: number = parseInt(lower.split(":")[0] || "0", 16);
    // fc00::/7 unique local, fe80::/10 link-local, ff00::/8 multicast, 2001:db8::/32 documentation.
    return !((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00 || lower.startsWith("2001:db8:"));
}

/** Refuses (throws) a webhook address that isn't `https://` on a host name or public address. */
export function checkWebhookUrl(raw: string): URL {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error("The address isn't a valid URL.");
    }
    if (url.protocol !== "https:") {
        throw new Error("The address must start with https://.");
    }
    if (url.username || url.password) {
        throw new Error("The address can't hold a user name or password.");
    }
    const host: string = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && !isPublicAddress(host)) {
        throw new Error("The address must be on the public internet.");
    }
    if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) {
        throw new Error("The address must be on the public internet.");
    }
    return url;
}

/** Resolves a host name to its addresses (every one, both families). */
export type HostLookup = (hostname: string) => Promise<LookupAddress[]>;

export const defaultLookup: HostLookup = async (hostname) => await dns.lookup(hostname, { all: true, verbatim: true });

/** What a webhook request came to. */
export interface WebhookResult {
    status: number;
}

/** How a webhook is posted: `postWebhook()`, or a double in tests. */
export type WebhookPoster = (url: string, body: string, secret: string) => Promise<WebhookResult>;

/** How `postWebhook()` resolves and connects. */
export interface PostOptions {
    lookup?: HostLookup;
    timeoutMs?: number;
    /** `https.request`, or a double in tests. */
    request?: typeof https.request;
}

/**
 * Posts `body` to `rawUrl`, signed with `secret`. The host is resolved first and every address it resolves to must be public; the
 * request then goes to the first of those addresses (with the host name kept for TLS and `Host`), so a name can't be switched to an
 * internal address between the check and the connection. Redirects aren't followed. Throws on a refused address, a network error or
 * a timeout; answers the status otherwise (the caller decides what counts as delivered).
 */
export async function postWebhook(rawUrl: string, body: string, secret: string, options: PostOptions = {}): Promise<WebhookResult> {
    const { lookup = defaultLookup, timeoutMs = WEBHOOK_TIMEOUT_MS, request: send = https.request } = options;
    const url: URL = checkWebhookUrl(rawUrl);
    const host: string = url.hostname.replace(/^\[|\]$/g, "");
    const addresses: LookupAddress[] = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await lookup(host);
    if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
        throw new Error("The address resolves to a private network.");
    }
    const target: LookupAddress = addresses[0];
    return await new Promise<WebhookResult>((resolve, reject) => {
        const request = send(
            {
                protocol: "https:",
                hostname: host,
                port: url.port || 443,
                path: `${url.pathname}${url.search}`,
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "content-length": Buffer.byteLength(body),
                    "user-agent": "RapidMX-CRM-Webhooks/1",
                    "x-rapidmx-signature": signWebhook(secret, body),
                },
                timeout: timeoutMs,
                lookup: (_hostname, _options, callback: any) => callback(null, target.address, target.family),
            },
            (response) => {
                response.resume();
                resolve({ status: response.statusCode ?? 0 });
            },
        );
        request.on("timeout", () => request.destroy(new Error(`No answer within ${timeoutMs / 1000} seconds.`)));
        request.on("error", reject);
        request.end(body);
    });
}
