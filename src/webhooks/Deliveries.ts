///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import * as crypto from "crypto";
import { ModelUtils } from "@rapidrest/service-core";
import type { CrmModelClasses, CrmRepos } from "../models/CrmModelClasses.js";
import { CrmContact, CrmEvent, WebhookDeliveryStatus, WebhookEndpoint } from "../models/types.js";

/** A webhook body: what happened, to whom, and its details. */
export interface WebhookPayload extends Record<string, unknown> {
    id: string;
    type: string;
    occurredAt: string;
    workspaceUid: string;
    contact?: { uid: string; email: string; firstName?: string; lastName?: string };
    data: Record<string, unknown>;
}

/** Whether `endpoint` takes events of `type`. */
export function wants(endpoint: Pick<WebhookEndpoint, "events" | "enabled">, type: string): boolean {
    return endpoint.enabled && (endpoint.events.includes("*") || endpoint.events.includes(type));
}

/** The body of `event`'s webhooks. */
export async function eventPayload(repos: CrmRepos, event: CrmEvent): Promise<WebhookPayload> {
    const contact: CrmContact | undefined = await (await repos.get<CrmContact>("contact")).findOne(event.contactUid, { ignoreACL: true, skipCache: true });
    return {
        id: event.uid,
        type: event.type,
        occurredAt: new Date(event.occurredAt).toISOString(),
        workspaceUid: event.workspaceUid,
        ...(contact ? { contact: { uid: contact.uid, email: contact.email, firstName: contact.firstName ?? undefined, lastName: contact.lastName ?? undefined } } : {}),
        data: event.data ?? {},
    };
}

/** Queues `payload` for each of `endpoints` (`WebhookDeliveryJob` posts it). */
export async function enqueueDeliveries(repos: CrmRepos, classes: CrmModelClasses, endpoints: WebhookEndpoint[], payload: WebhookPayload): Promise<number> {
    const deliveries = await repos.get("webhookDelivery");
    for (const endpoint of endpoints) {
        await deliveries.create(
            new classes.webhookDelivery({
                workspaceUid: endpoint.workspaceUid,
                endpointUid: endpoint.uid,
                eventType: payload.type,
                payload,
                status: WebhookDeliveryStatus.PENDING,
                nextAttemptAt: new Date(),
            }),
            { ignoreACL: true, skipPush: true },
        );
    }
    return endpoints.length;
}

/** The workspace's enabled endpoints. */
export async function enabledEndpoints(repos: CrmRepos, workspaceUid: string): Promise<WebhookEndpoint[]> {
    return await (await repos.get<WebhookEndpoint>("webhookEndpoint")).find(
        { workspaceUid: ModelUtils.literal(workspaceUid), enabled: ModelUtils.literal(true) },
        { ignoreACL: true, limit: 100, skipCache: true },
    );
}

/** A made-up id, for payloads that aren't a stored event (a test ping, an automation's webhook step). */
export function payloadId(): string {
    return crypto.randomUUID();
}
