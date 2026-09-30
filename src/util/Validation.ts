///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ApiError } from "@rapidrest/core";
import { ApiErrors } from "@rapidrest/service-core";

/** The longest one-line text field (a name, a title, a job title...). */
export const MAX_SHORT_TEXT = 256;
/** The longest multi-line text field (a note, a description). */
export const MAX_LONG_TEXT = 20000;
/** The longest email address (RFC 5321). */
export const MAX_EMAIL_LENGTH = 254;
/** How many tags one record may carry, and how long one may be. */
export const MAX_TAGS = 50;
export const MAX_TAG_LENGTH = 64;

/** One address: something before and after a single `@`, no whitespace, and nothing a query could read as an operator. */
const EMAIL_PATTERN = /^[^\s()@,<>"';]+@[^\s()@,<>"';]+\.[^\s()@,<>"';.]+$/;

/** A 400 `ApiError` with `message`. */
export function badRequest(message: string): ApiError {
    return new ApiError(ApiErrors.INVALID_REQUEST, 400, message);
}

/** A 409 `ApiError` with `message`. */
export function conflict(message: string): ApiError {
    return new ApiError(ApiErrors.IDENTIFIER_EXISTS, 409, message);
}

/** Whether `body` is a plain JSON object. */
export function isObject(body: unknown): body is Record<string, unknown> {
    return typeof body === "object" && body !== null && !Array.isArray(body);
}

/** `body` as a plain object, or a 400. */
export function requireObject(body: unknown): Record<string, unknown> {
    if (!isObject(body)) {
        throw badRequest("The request body must be a JSON object.");
    }
    return body;
}

/**
 * A text field: trimmed, at most `max` characters. `undefined` when absent; `null` when explicitly cleared (`null` or empty),
 * which only an optional field allows. A required field that is missing or empty is a 400.
 */
export function readText(body: Record<string, unknown>, field: string, options: { required?: boolean; max?: number } = {}): string | null | undefined {
    const raw: unknown = body[field];
    if (raw === undefined) {
        if (options.required) {
            throw badRequest(`'${field}' is required.`);
        }
        return undefined;
    }
    if (raw !== null && typeof raw !== "string") {
        throw badRequest(`'${field}' must be a string.`);
    }
    const value: string = (raw ?? "").trim();
    if (value.length === 0) {
        if (options.required) {
            throw badRequest(`'${field}' is required.`);
        }
        return null;
    }
    const max: number = options.max ?? MAX_SHORT_TEXT;
    if (value.length > max) {
        throw badRequest(`'${field}' must be at most ${max} characters.`);
    }
    return value;
}

/** An email address, lowercased. The same absent/cleared/required rules as `readText()`. */
export function readEmail(body: Record<string, unknown>, field: string, options: { required?: boolean } = {}): string | null | undefined {
    const value: string | null | undefined = readText(body, field, { ...options, max: MAX_EMAIL_LENGTH });
    if (typeof value === "string") {
        const email: string = value.toLowerCase();
        if (!isEmail(email)) {
            throw badRequest(`'${field}' must be an email address.`);
        }
        return email;
    }
    return value;
}

/** Whether `value` looks like one email address. */
export function isEmail(value: string): boolean {
    return value.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(value);
}

/** One of `allowed`. `undefined` when absent; `null` when explicitly cleared, which only an optional field allows. */
export function readEnum<T extends string>(
    body: Record<string, unknown>,
    field: string,
    allowed: readonly T[],
    options: { required?: boolean } = {},
): T | null | undefined {
    const raw: unknown = body[field];
    if (raw === undefined || raw === null) {
        if (options.required) {
            throw badRequest(`'${field}' is required.`);
        }
        return raw;
    }
    if (typeof raw !== "string" || !allowed.includes(raw as T)) {
        throw badRequest(`'${field}' must be one of: ${allowed.join(", ")}.`);
    }
    return raw as T;
}

/** A finite number, optionally an integer within `[min, max]`. `undefined` when absent; `null` when cleared. */
export function readNumber(
    body: Record<string, unknown>,
    field: string,
    options: { integer?: boolean; min?: number; max?: number } = {},
): number | null | undefined {
    const raw: unknown = body[field];
    if (raw === undefined || raw === null) {
        return raw;
    }
    if (typeof raw !== "number" || !Number.isFinite(raw) || (options.integer && !Number.isInteger(raw))) {
        throw badRequest(`'${field}' must be ${options.integer ? "a whole number" : "a number"}.`);
    }
    if ((options.min !== undefined && raw < options.min) || (options.max !== undefined && raw > options.max)) {
        throw badRequest(`'${field}' must be between ${options.min ?? "-infinity"} and ${options.max ?? "infinity"}.`);
    }
    return raw;
}

/** A boolean. `undefined` when absent. */
export function readBoolean(body: Record<string, unknown>, field: string): boolean | undefined {
    const raw: unknown = body[field];
    if (raw === undefined) {
        return undefined;
    }
    if (typeof raw !== "boolean") {
        throw badRequest(`'${field}' must be true or false.`);
    }
    return raw;
}

/** A date from an ISO 8601 string. `undefined` when absent; `null` when cleared. */
export function readDate(body: Record<string, unknown>, field: string): Date | null | undefined {
    const raw: unknown = body[field];
    if (raw === undefined || raw === null || raw === "") {
        return raw === "" ? null : (raw);
    }
    const date: Date | undefined = parseDate(raw);
    if (!date) {
        throw badRequest(`'${field}' must be a date.`);
    }
    return date;
}

/** `raw` as a valid date, from an ISO 8601 string or a `Date`, or `undefined`. */
export function parseDate(raw: unknown): Date | undefined {
    const date: Date = raw instanceof Date ? raw : typeof raw === "string" && raw.length <= 64 ? new Date(raw) : new Date(NaN);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

/** One tag, normalized: trimmed, lowercased, inner whitespace collapsed. `undefined` when it is empty or too long. */
export function normalizeTag(raw: unknown): string | undefined {
    if (typeof raw !== "string") {
        return undefined;
    }
    const tag: string = raw.trim().toLowerCase().replace(/\s+/g, " ");
    return tag.length > 0 && tag.length <= MAX_TAG_LENGTH ? tag : undefined;
}

/** A list of tags, normalized and de-duplicated. `undefined` when absent. */
export function readTags(body: Record<string, unknown>, field: string = "tags"): string[] | undefined {
    const raw: unknown = body[field];
    if (raw === undefined) {
        return undefined;
    }
    if (raw === null) {
        return [];
    }
    if (!Array.isArray(raw)) {
        throw badRequest(`'${field}' must be a list of strings.`);
    }
    const tags: string[] = [];
    for (const entry of raw) {
        const tag: string | undefined = normalizeTag(entry);
        if (tag === undefined) {
            throw badRequest(`Each of '${field}' must be text of 1 to ${MAX_TAG_LENGTH} characters.`);
        }
        if (!tags.includes(tag)) {
            tags.push(tag);
        }
    }
    if (tags.length > MAX_TAGS) {
        throw badRequest(`A record may have at most ${MAX_TAGS} tags.`);
    }
    return tags;
}

/** A page of a list: `limit` between 1 and `maxLimit` (default 50), `page` from 0. */
export function readPaging(limit: unknown, page: unknown, maxLimit: number = 200): { limit: number; page: number } {
    const parsedLimit: number = limit === undefined || limit === "" ? 50 : Number(limit);
    const parsedPage: number = page === undefined || page === "" ? 0 : Number(page);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > maxLimit) {
        throw badRequest(`'limit' must be a whole number from 1 to ${maxLimit}.`);
    }
    if (!Number.isInteger(parsedPage) || parsedPage < 0 || parsedPage > 100000) {
        throw badRequest("'page' must be a whole number from 0.");
    }
    return { limit: parsedLimit, page: parsedPage };
}

/** A company's web domain from a domain, a URL or an email address: lowercase, without scheme, path, port or `www.`. */
export function normalizeDomain(raw: string): string | undefined {
    let value: string = raw.trim().toLowerCase();
    const at: number = value.lastIndexOf("@");
    if (at >= 0) {
        value = value.slice(at + 1);
    }
    value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split(/[/?#]/)[0].split(":")[0].replace(/^www\./, "").replace(/\.$/, "");
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value) && value.length <= 253 ? value : undefined;
}
