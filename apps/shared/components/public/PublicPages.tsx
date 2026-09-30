///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * The CRM's public pages, which subscribers reach from emails and forms without signing in: the preference center, double opt-in
 * confirmation, one-click unsubscribe, and signup forms. Each is drawn in the deployment's branding.
 */
import React, { FormEvent, PropsWithChildren, useEffect, useState } from "react";
import { ApiRequestError } from "@rapidmx/web-client/lib/util/api.js";
import useBranding from "@rapidmx/web-client/lib/branding/useBranding.js";
import { BrandingFooter, BrandingHeader } from "@rapidmx/web-client/shared/components/layout/BrandingChrome.js";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import {
    FormResult,
    Preferences,
    PublicForm,
    PublicFormField,
    confirmSubscription,
    getPreferences,
    getPublicForm,
    savePreferences,
    submitForm,
    unsubscribe,
} from "../../publicApi.js";
import { HONEYPOT_NAME } from "./honeypot.js";

const INPUT_CLASS = "w-full text-sm py-2 px-3 border border-border rounded-sm bg-surface text-text focus:outline-none focus:border-primary";

/** What a failed call says to a visitor: the server's own words for a refusal, a friendlier line for a link that doesn't work. */
function visitorMessage(err: unknown, fallback: string): string {
    if (err instanceof ApiRequestError && err.status === 404) {
        return "This link doesn't work any more. Use the link in your most recent email.";
    }
    return err instanceof ApiRequestError ? err.message : fallback;
}

/** The frame of a public page: the deployment's branding around a centred card. */
export function PublicPage({ title, children }: PropsWithChildren<{ title: string }>) {
    const { branding } = useBranding();
    return (
        <div className="min-h-screen flex flex-col">
            <BrandingHeader branding={branding} />
            <main className="flex-1 bg-surface-alt px-4 py-8 sm:py-12">
                <div className="mx-auto w-full max-w-xl rounded-lg border border-border bg-surface shadow-sm p-6 sm:p-8">
                    <h1 className="text-xl font-bold tracking-tight mb-4">{title}</h1>
                    {children}
                </div>
            </main>
            <BrandingFooter branding={branding} />
        </div>
    );
}

/** A page that needs a token from an email but was opened without one. */
export function MissingLinkPage({ title }: { title: string }) {
    return (
        <PublicPage title={title}>
            <p className="text-sm">Open this page from the link in one of our emails.</p>
        </PublicPage>
    );
}

/** The preference center: which lists to be on, and unsubscribing from all email. */
export function PreferenceCenterPage({ token }: { token: string }) {
    const [preferences, setPreferences] = useState<Preferences | null>(null);
    const [choices, setChoices] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState<string | null>(null);

    function show(next: Preferences): void {
        setPreferences(next);
        setChoices(Object.fromEntries(next.lists.map((list) => [list.uid, list.subscribed])));
    }

    useEffect(() => {
        getPreferences(token)
            .then(show)
            .catch((err) => setError(visitorMessage(err, "Your preferences could not be loaded.")));
    }, [token]);

    async function save(input: { lists?: Record<string, boolean>; unsubscribeAll?: boolean }, message: string): Promise<void> {
        try {
            show(await savePreferences(token, input));
            setSaved(message);
            setError(null);
        } catch (err) {
            setSaved(null);
            setError(visitorMessage(err, "Your preferences could not be saved."));
        }
    }

    return (
        <PublicPage title="Email preferences">
            {error && <Alert>{error}</Alert>}
            {saved && <p className="text-sm text-success mb-3">{saved}</p>}
            {preferences && (
                <>
                    <p className="text-sm mb-4">
                        Choose what {preferences.workspaceName} sends to <strong>{preferences.email}</strong>.
                    </p>
                    {preferences.unsubscribedAll && (
                        <div className="text-sm mb-4">
                            You have unsubscribed from all email.{" "}
                            <button type="button" className="text-primary-dark underline" onClick={() => void save({ unsubscribeAll: false }, "Welcome back.")}>
                                Resubscribe
                            </button>
                        </div>
                    )}
                    <form
                        onSubmit={(event: FormEvent) => {
                            event.preventDefault();
                            void save({ lists: choices }, "Your preferences are saved.");
                        }}
                        className="flex flex-col gap-3"
                    >
                        {preferences.lists.map((list) => (
                            <label key={list.uid} className="flex items-start gap-3 text-sm">
                                <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={choices[list.uid] ?? false}
                                    onChange={(event) => setChoices((current) => ({ ...current, [list.uid]: event.target.checked }))}
                                />
                                <span>
                                    <span className="font-medium">{list.name}</span>
                                    {list.description && <span className="block text-text-muted">{list.description}</span>}
                                </span>
                            </label>
                        ))}
                        {preferences.lists.length > 0 && (
                            <Button type="submit" className="!w-auto self-start">
                                Save preferences
                            </Button>
                        )}
                    </form>
                    {!preferences.unsubscribedAll && (
                        <button
                            type="button"
                            className="text-sm text-danger underline mt-6"
                            onClick={() => void save({ unsubscribeAll: true }, "You won't get any more marketing email from us.")}
                        >
                            Unsubscribe from all email
                        </button>
                    )}
                </>
            )}
        </PublicPage>
    );
}

/** Confirming a double opt-in subscription: one button, so a link scanner opening the page doesn't confirm on the reader's behalf. */
export function ConfirmPage({ token }: { token: string }) {
    const [result, setResult] = useState<{ workspaceName: string; lists: string[] } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function confirm(): Promise<void> {
        setBusy(true);
        try {
            setResult(await confirmSubscription(token));
            setError(null);
        } catch (err) {
            setError(visitorMessage(err, "Your subscription could not be confirmed."));
        } finally {
            setBusy(false);
        }
    }

    return (
        <PublicPage title="Confirm your subscription">
            {error && <Alert>{error}</Alert>}
            {result ? (
                <p className="text-sm">
                    {result.lists.length > 0
                        ? `Thanks! You're subscribed to ${result.lists.join(", ")} from ${result.workspaceName}.`
                        : "There is nothing left to confirm: you may have confirmed already, or unsubscribed since."}
                </p>
            ) : (
                <>
                    <p className="text-sm mb-4">Confirm that you want to receive these emails.</p>
                    <Button type="button" className="!w-auto" loading={busy} disabled={busy} onClick={() => void confirm()}>
                        Confirm subscription
                    </Button>
                </>
            )}
        </PublicPage>
    );
}

/** An unsubscribe link's landing page: one button, then a way to the preference center. */
export function UnsubscribePage({ token }: { token: string }) {
    const [result, setResult] = useState<{ workspaceName: string; list?: string; preferencesToken: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function run(): Promise<void> {
        setBusy(true);
        try {
            setResult(await unsubscribe(token));
            setError(null);
        } catch (err) {
            setError(visitorMessage(err, "You could not be unsubscribed. Please try again."));
        } finally {
            setBusy(false);
        }
    }

    return (
        <PublicPage title="Unsubscribe">
            {error && <Alert>{error}</Alert>}
            {result ? (
                <>
                    <p className="text-sm mb-4">
                        {result.list ? `You're unsubscribed from ${result.list}.` : `You won't get any more marketing email from ${result.workspaceName}.`}
                    </p>
                    <a className="text-sm text-primary-dark underline" href={`/subscriptions/${encodeURIComponent(result.preferencesToken)}`}>
                        Manage your email preferences
                    </a>
                </>
            ) : (
                <Button type="button" className="!w-auto" loading={busy} disabled={busy} onClick={() => void run()}>
                    Unsubscribe
                </Button>
            )}
        </PublicPage>
    );
}

/** A signup form. */
export function SignupFormPage({ formUid }: { formUid: string }) {
    const [form, setForm] = useState<PublicForm | null>(null);
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [trap, setTrap] = useState("");
    const [result, setResult] = useState<FormResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        getPublicForm(formUid)
            .then(setForm)
            .catch((err) => setError(err instanceof ApiRequestError && err.status === 404 ? "This form isn't available." : "The form could not be loaded."));
    }, [formUid]);

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setBusy(true);
        try {
            const answer: FormResult = await submitForm(formUid, values, trap);
            if (answer.result === "subscribed" && answer.redirectUrl) {
                window.location.assign(answer.redirectUrl);
                return;
            }
            setResult(answer);
            setError(null);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "The form could not be sent. Please try again.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <PublicPage title={form?.title ?? "Sign up"}>
            {error && <Alert>{error}</Alert>}
            {result && <p className="text-sm">{result.message}</p>}
            {form && !result && (
                <form onSubmit={submit} className="flex flex-col gap-3" aria-label={form.title}>
                    {form.description && <p className="text-sm text-text-muted">{form.description}</p>}
                    {form.fields.map((field) => (
                        <SignupField key={field.target} field={field} value={values[field.target]} onChange={(value) => setValues((current) => ({ ...current, [field.target]: value }))} />
                    ))}
                    <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
                        <label>
                            Leave this empty
                            <input name={HONEYPOT_NAME} tabIndex={-1} autoComplete="off" value={trap} onChange={(event) => setTrap(event.target.value)} />
                        </label>
                    </div>
                    <Button type="submit" className="!w-auto self-start" loading={busy} disabled={busy}>
                        Sign up
                    </Button>
                </form>
            )}
        </PublicPage>
    );
}

/** One field of a signup form, with an input suited to its type. */
function SignupField({ field, value, onChange }: { field: PublicFormField; value: unknown; onChange: (value: unknown) => void }) {
    const id: string = `signup-${field.target}`;
    const label: string = `${field.label}${field.required ? " *" : ""}`;
    if (field.type === "boolean") {
        return (
            <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
                {label}
            </label>
        );
    }
    if (field.type === "multi_select") {
        const chosen: string[] = Array.isArray(value) ? (value as string[]) : [];
        return (
            <fieldset className="text-sm">
                <legend className="font-medium mb-1">{label}</legend>
                {(field.options ?? []).map((option) => (
                    <label key={option.value} className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={chosen.includes(option.value)}
                            onChange={(event) => onChange(event.target.checked ? [...chosen, option.value] : chosen.filter((entry) => entry !== option.value))}
                        />
                        {option.label}
                    </label>
                ))}
            </fieldset>
        );
    }
    return (
        <FormField label={label} htmlFor={id}>
            {field.type === "select" ? (
                <select id={id} className={INPUT_CLASS} value={(value as string) ?? ""} required={field.required} onChange={(event) => onChange(event.target.value)}>
                    <option value="">Choose&hellip;</option>
                    {(field.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            ) : (
                <input
                    id={id}
                    className={INPUT_CLASS}
                    type={field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                    required={field.required}
                    value={(value as string) ?? ""}
                    onChange={(event) => onChange(event.target.value)}
                />
            )}
        </FormField>
    );
}
