///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import {
    API_KEY_SCOPES,
    ApiKey,
    ApiKeyScope,
    WEBHOOK_EVENTS,
    WebhookDelivery,
    WebhookEndpoint,
    createApiKey,
    createWebhook,
    deleteApiKey,
    deleteWebhook,
    errorMessage,
    listApiKeys,
    listWebhooks,
    rotateWebhookSecret,
    testWebhook,
    updateWebhook,
    webhookDeliveries,
} from "../crmApi.js";
import { INPUT_CLASS, useCrm } from "./CrmShell.js";
import { when } from "./campaigns/campaignUi.js";

const SCOPE_LABELS: Record<ApiKeyScope, string> = {
    contacts: "Add and update contacts",
    subscriptions: "Subscribe and unsubscribe",
    events: "Report events",
};

/** A secret or key shown once, to copy now. */
function ShownOnce({ label, value, onDone }: { label: string; value: string; onDone: () => void }) {
    return (
        <div role="alert" className="border border-accent rounded-sm p-3 mb-3 text-sm">
            <p className="mb-2">{label} It won't be shown again.</p>
            <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 break-all bg-surface-alt rounded-sm px-2 py-1">{value}</code>
                <Button variant="text" type="button" onClick={() => void navigator.clipboard?.writeText(value)}>
                    Copy
                </Button>
                <Button variant="text" type="button" onClick={onDone}>
                    Done
                </Button>
            </div>
        </div>
    );
}

/** The last deliveries to an endpoint. */
function Deliveries({ workspaceUid, endpointUid }: { workspaceUid: string; endpointUid: string }) {
    const [deliveries, setDeliveries] = useState<WebhookDelivery[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        webhookDeliveries(workspaceUid, endpointUid).then(setDeliveries, (err) => setError(errorMessage(err, "Could not load the deliveries.")));
    }, [workspaceUid, endpointUid]);
    if (error) {
        return <Alert>{error}</Alert>;
    }
    if (!deliveries) {
        return <p className="text-sm text-text-muted">Loading&hellip;</p>;
    }
    if (deliveries.length === 0) {
        return <p className="text-sm text-text-muted">Nothing has been sent to it yet.</p>;
    }
    return (
        <table className="w-full text-sm">
            <thead>
                <tr className="text-left text-text-muted">
                    <th className="font-normal py-1">Event</th>
                    <th className="font-normal py-1">Status</th>
                    <th className="font-normal py-1">Attempts</th>
                    <th className="font-normal py-1">Queued</th>
                </tr>
            </thead>
            <tbody>
                {deliveries.map((delivery) => (
                    <tr key={delivery.uid} className="border-t border-border align-top">
                        <td className="py-1">{delivery.eventType}</td>
                        <td className="py-1">
                            {delivery.status}
                            {delivery.responseStatus ? ` (${delivery.responseStatus})` : ""}
                            {delivery.lastError && delivery.status !== "delivered" && <div className="text-xs text-text-muted">{delivery.lastError}</div>}
                        </td>
                        <td className="py-1">{delivery.attempts}</td>
                        <td className="py-1">{when(delivery.dateCreated)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

/**
 * A workspace's webhook endpoints: adding one (an https address, and every event or chosen ones), switching it off and on, pinging
 * it, rotating its signing secret, its recent deliveries, and deleting it. Only admins change them.
 */
export function Webhooks() {
    const { workspace, canManage } = useCrm();
    const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [secret, setSecret] = useState<string | null>(null);
    const [results, setResults] = useState<Record<string, string>>({});
    const [open, setOpen] = useState<string | null>(null);
    const [url, setUrl] = useState<string>("");
    const [description, setDescription] = useState<string>("");
    const [allEvents, setAllEvents] = useState<boolean>(true);
    const [events, setEvents] = useState<string[]>([]);

    async function load(): Promise<void> {
        try {
            setEndpoints(await listWebhooks(workspace.uid));
        } catch (err) {
            setError(errorMessage(err, "Could not load the webhooks."));
        }
    }

    useEffect(() => {
        void load();
    }, [workspace.uid]);

    async function run(action: () => Promise<unknown>, failure: string): Promise<void> {
        setError(null);
        try {
            await action();
            await load();
        } catch (err) {
            setError(errorMessage(err, failure));
        }
    }

    async function add(event: FormEvent): Promise<void> {
        event.preventDefault();
        await run(async () => {
            const created: WebhookEndpoint = await createWebhook(workspace.uid, { url: url.trim(), events: allEvents ? ["*"] : events, description: description.trim() || undefined });
            setSecret(created.secret ?? null);
            setUrl("");
            setDescription("");
            setEvents([]);
            setAllEvents(true);
        }, "Could not add the webhook.");
    }

    async function test(endpoint: WebhookEndpoint): Promise<void> {
        setResults({ ...results, [endpoint.uid]: "Sending…" });
        try {
            const result = await testWebhook(workspace.uid, endpoint.uid);
            const text: string =
                result.error !== undefined ? `Failed: ${result.error}` : result.status! >= 200 && result.status! < 300 ? `Delivered (${result.status})` : `The endpoint answered ${result.status}.`;
            setResults((current) => ({ ...current, [endpoint.uid]: text }));
        } catch (err) {
            setResults((current) => ({ ...current, [endpoint.uid]: errorMessage(err, "Could not send the test.") }));
        }
    }

    return (
        <section aria-labelledby="crm-webhooks" className="mb-10">
            <h2 id="crm-webhooks" className="text-lg font-semibold mb-1">
                Webhooks
            </h2>
            <p className="text-sm text-text-muted mb-3">
                Posts what happens in the workspace to your systems as signed JSON (the <code>X-RapidMX-Signature</code> header holds <code>t=</code>, the time, and{" "}
                <code>v1=</code>, the HMAC-SHA256 of <code>time.body</code> with the endpoint's secret). Failed posts are retried; an endpoint that keeps failing is switched
                off.
            </p>
            {error && <Alert>{error}</Alert>}
            {secret && <ShownOnce label="The endpoint's signing secret:" value={secret} onDone={() => setSecret(null)} />}
            {endpoints.length === 0 && <p className="text-sm text-text-muted mb-3">No webhooks yet.</p>}
            <ul className="list-none m-0 p-0 mb-4">
                {endpoints.map((endpoint) => (
                    <li key={endpoint.uid} className="border border-border rounded-sm p-3 mb-2">
                        <div className="flex items-start gap-2 flex-wrap">
                            <div className="flex-1 min-w-0">
                                <div className="font-mono text-sm break-all">{endpoint.url}</div>
                                <div className="text-xs text-text-muted">
                                    {endpoint.events.includes("*") ? "Every event" : endpoint.events.join(", ")}
                                    {endpoint.description ? ` · ${endpoint.description}` : ""} · secret {endpoint.secretHint}
                                </div>
                                <div className="text-xs mt-1">
                                    {endpoint.enabled ? <span>On</span> : <span className="font-semibold">Off</span>}
                                    {endpoint.failureCount > 0 && ` · ${endpoint.failureCount} failed in a row`}
                                    {endpoint.lastError && <span className="text-text-muted"> · {endpoint.lastError}</span>}
                                </div>
                                {results[endpoint.uid] && <div className="text-xs mt-1" role="status">{results[endpoint.uid]}</div>}
                            </div>
                            <div className="flex gap-3 flex-wrap">
                                <button type="button" className="text-sm text-primary-dark hover:underline" onClick={() => setOpen(open === endpoint.uid ? null : endpoint.uid)} aria-expanded={open === endpoint.uid}>
                                    Deliveries
                                </button>
                                {canManage && (
                                    <>
                                        <button type="button" className="text-sm text-primary-dark hover:underline" onClick={() => void test(endpoint)}>
                                            Test
                                        </button>
                                        <button type="button" className="text-sm text-primary-dark hover:underline"
                                            onClick={() => void run(() => updateWebhook(workspace.uid, endpoint.uid, { enabled: !endpoint.enabled }), "Could not change the webhook.")}
                                        >
                                            {endpoint.enabled ? "Switch off" : "Switch on"}
                                        </button>
                                        <button type="button" className="text-sm text-primary-dark hover:underline"
                                            onClick={() => {
                                                if (window.confirm("Make a new signing secret? The current one stops working at once.")) {
                                                    void run(async () => setSecret((await rotateWebhookSecret(workspace.uid, endpoint.uid)).secret), "Could not make a new secret.");
                                                }
                                            }}
                                        >
                                            New secret
                                        </button>
                                        <button type="button" className="text-sm text-primary-dark hover:underline"
                                            onClick={() => {
                                                if (window.confirm(`Delete the webhook to ${endpoint.url}?`)) {
                                                    void run(() => deleteWebhook(workspace.uid, endpoint.uid), "Could not delete the webhook.");
                                                }
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                        {open === endpoint.uid && (
                            <div className="mt-3">
                                <Deliveries workspaceUid={workspace.uid} endpointUid={endpoint.uid} />
                            </div>
                        )}
                    </li>
                ))}
            </ul>
            {canManage && (
                <form onSubmit={(event) => void add(event)} className="border border-border rounded-sm p-3" aria-label="Add a webhook">
                    <h3 className="text-sm font-semibold mb-2">Add a webhook</h3>
                    <FormField label="Address (https)" htmlFor="crm-webhook-url">
                        <input id="crm-webhook-url" className={INPUT_CLASS} type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/hooks/crm" />
                    </FormField>
                    <FormField label="Description" htmlFor="crm-webhook-description">
                        <input id="crm-webhook-description" className={INPUT_CLASS} value={description} onChange={(event) => setDescription(event.target.value)} />
                    </FormField>
                    <label className="text-sm flex items-center gap-2 mb-2">
                        <input type="checkbox" checked={allEvents} onChange={(event) => setAllEvents(event.target.checked)} />
                        Every event
                    </label>
                    {!allEvents && (
                        <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-1 mb-2 text-sm">
                            <legend className="sr-only">Events</legend>
                            {WEBHOOK_EVENTS.map((type) => (
                                <label key={type} className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={events.includes(type)}
                                        onChange={(event) => setEvents(event.target.checked ? [...events, type] : events.filter((entry) => entry !== type))}
                                    />
                                    <code>{type}</code>
                                </label>
                            ))}
                        </fieldset>
                    )}
                    <Button type="submit" className="!w-auto" disabled={!url.trim() || (!allEvents && events.length === 0)}>
                        Add webhook
                    </Button>
                </form>
            )}
        </section>
    );
}

/**
 * A workspace's API keys, for its own systems to add contacts, change subscriptions and report events: making one (named, with
 * its scopes - shown once), and revoking it. Only admins see and change them.
 */
export function ApiKeys() {
    const { workspace } = useCrm();
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [issued, setIssued] = useState<string | null>(null);
    const [name, setName] = useState<string>("");
    const [scopes, setScopes] = useState<ApiKeyScope[]>([...API_KEY_SCOPES]);

    async function load(): Promise<void> {
        try {
            setKeys(await listApiKeys(workspace.uid));
        } catch (err) {
            setError(errorMessage(err, "Could not load the API keys."));
        }
    }

    useEffect(() => {
        void load();
    }, [workspace.uid]);

    async function add(event: FormEvent): Promise<void> {
        event.preventDefault();
        setError(null);
        try {
            const created: ApiKey = await createApiKey(workspace.uid, { name: name.trim(), scopes });
            setIssued(created.key ?? null);
            setName("");
            setScopes([...API_KEY_SCOPES]);
            await load();
        } catch (err) {
            setError(errorMessage(err, "Could not make the API key."));
        }
    }

    async function revoke(key: ApiKey): Promise<void> {
        if (!window.confirm(`Revoke the key "${key.name}"? Anything using it stops working.`)) {
            return;
        }
        setError(null);
        try {
            await deleteApiKey(workspace.uid, key.uid);
            await load();
        } catch (err) {
            setError(errorMessage(err, "Could not revoke the API key."));
        }
    }

    const base: string = `${window.location.origin}/api/mail/crm/integrations/${workspace.uid}`;
    return (
        <section aria-labelledby="crm-api-keys">
            <h2 id="crm-api-keys" className="text-lg font-semibold mb-1">
                API keys
            </h2>
            <p className="text-sm text-text-muted mb-3">
                Your systems call <code className="break-all">{base}</code> with <code>Authorization: Bearer &lt;key&gt;</code>: <code>POST /contacts</code>,{" "}
                <code>POST /subscribe</code>, <code>POST /unsubscribe</code>, <code>POST /events</code> (which can start automations) and <code>GET /lists</code>.
            </p>
            {error && <Alert>{error}</Alert>}
            {issued && <ShownOnce label="The new API key:" value={issued} onDone={() => setIssued(null)} />}
            {keys.length === 0 ? (
                <p className="text-sm text-text-muted mb-3">No API keys yet.</p>
            ) : (
                <table className="w-full text-sm mb-4">
                    <thead>
                        <tr className="text-left text-text-muted">
                            <th className="font-normal py-1">Name</th>
                            <th className="font-normal py-1">Key</th>
                            <th className="font-normal py-1">Can</th>
                            <th className="font-normal py-1">Last used</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {keys.map((key) => (
                            <tr key={key.uid} className="border-t border-border align-top">
                                <td className="py-1">{key.name}</td>
                                <td className="py-1 font-mono">{key.prefix}…</td>
                                <td className="py-1">{key.scopes.map((scope) => SCOPE_LABELS[scope]).join(", ")}</td>
                                <td className="py-1">{when(key.lastUsedAt)}</td>
                                <td className="py-1 text-right">
                                    <button type="button" className="text-sm text-primary-dark hover:underline" onClick={() => void revoke(key)}>
                                        Revoke
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <form onSubmit={(event) => void add(event)} className="border border-border rounded-sm p-3" aria-label="Make an API key">
                <h3 className="text-sm font-semibold mb-2">Make an API key</h3>
                <FormField label="Name" htmlFor="crm-api-key-name">
                    <input id="crm-api-key-name" className={INPUT_CLASS} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Website signup" />
                </FormField>
                <fieldset className="mb-2 text-sm">
                    <legend className="mb-1">It can</legend>
                    {API_KEY_SCOPES.map((scope) => (
                        <label key={scope} className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={scopes.includes(scope)}
                                onChange={(event) => setScopes(event.target.checked ? [...scopes, scope] : scopes.filter((entry) => entry !== scope))}
                            />
                            {SCOPE_LABELS[scope]}
                        </label>
                    ))}
                </fieldset>
                <Button type="submit" className="!w-auto" disabled={!name.trim() || scopes.length === 0}>
                    Make key
                </Button>
            </form>
        </section>
    );
}

/** The workspace's integrations: webhooks, and - for admins - API keys. */
export default function Integrations() {
    const { canManage } = useCrm();
    return (
        <div>
            <h1 className="text-xl font-bold mb-4">Integrations</h1>
            <Webhooks />
            {canManage ? <ApiKeys /> : <p className="text-sm text-text-muted">Only the workspace's admins can see and make API keys.</p>}
        </div>
    );
}
