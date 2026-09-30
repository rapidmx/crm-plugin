///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over the CRM's anonymous API (`/api/mail/crm/public/...`), for the public pages: signup forms, the preference
 * center, double opt-in confirmation and one-click unsubscribe. No sign-in is sent or needed; tokens come from the links in emails.
 */
import { apiFetch } from "@rapidmx/web-client/lib/util/api.js";

export interface PublicFormField {
    target: string;
    label: string;
    required: boolean;
    type: "email" | "text" | "number" | "date" | "boolean" | "select" | "multi_select";
    options?: { value: string; label: string }[];
}

export interface PublicForm {
    uid: string;
    title: string;
    description?: string;
    fields: PublicFormField[];
}

export interface FormResult {
    result: "confirm" | "subscribed";
    message: string;
    redirectUrl?: string;
}

export interface Preferences {
    workspaceName: string;
    email: string;
    unsubscribedAll: boolean;
    lists: { uid: string; name: string; description?: string; subscribed: boolean }[];
}

const enc = encodeURIComponent;
const post = (body?: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body ?? {}) });

export const getPublicForm = (formUid: string): Promise<PublicForm> => apiFetch(`/mail/crm/public/forms/${enc(formUid)}`);
export const submitForm = (formUid: string, values: Record<string, unknown>, website: string): Promise<FormResult> =>
    apiFetch(`/mail/crm/public/forms/${enc(formUid)}`, post({ values, website }));
export const confirmSubscription = (token: string): Promise<{ workspaceName: string; lists: string[] }> => apiFetch(`/mail/crm/public/confirm/${enc(token)}`, post());
export const getPreferences = (token: string): Promise<Preferences> => apiFetch(`/mail/crm/public/preferences/${enc(token)}`);
export const savePreferences = (token: string, input: { lists?: Record<string, boolean>; unsubscribeAll?: boolean }): Promise<Preferences> =>
    apiFetch(`/mail/crm/public/preferences/${enc(token)}`, post(input));
export const unsubscribe = (token: string): Promise<{ workspaceName: string; list?: string; preferencesToken: string }> =>
    apiFetch(`/mail/crm/public/unsubscribe/${enc(token)}`, post());
