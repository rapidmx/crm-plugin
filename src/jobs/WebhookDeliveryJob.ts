///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { ModelUtils, RepoUtils } from "@rapidrest/service-core";
import { WebhookDelivery, WebhookDeliveryStatus, WebhookEndpoint } from "../models/types.js";
import { MAX_PAYLOAD_BYTES, WebhookPoster, postWebhook } from "../webhooks/Webhooks.js";
import { CrmJobBase } from "./CrmJobBase.js";
const { Config } = ObjectDecorators;

/** Failed deliveries in a row after which an endpoint is switched off. */
export const MAX_ENDPOINT_FAILURES = 20;

/**
 * Posts queued webhook deliveries: each is leased (version-checked), posted (`postWebhook()` - public addresses only, signed), and
 * marked delivered on a 2xx answer. Anything else is retried with backoff (1, 2, 4... minutes) up to `max_attempts`, then failed. An
 * endpoint that fails `MAX_ENDPOINT_FAILURES` deliveries in a row is switched off, its queued deliveries failed. Deliveries older than
 * `retention_days` are deleted.
 */
export abstract class WebhookDeliveryJob extends CrmJobBase {
    @Config("mail:crm:jobs:webhooks:schedule", "*/5 * * * * *")
    protected scheduleExpr: string = "*/5 * * * * *";

    @Config("mail:crm:jobs:webhooks:max_attempts", 8)
    protected maxAttempts: number = 8;

    @Config("mail:crm:jobs:webhooks:retention_days", 14)
    protected retentionDays: number = 14;

    /** How a webhook is posted - a seam for tests. */
    protected post: WebhookPoster = postWebhook;

    public get schedule(): string | undefined {
        return this.scheduleExpr;
    }

    public async run(): Promise<void> {
        const deliveries: RepoUtils<WebhookDelivery> = await this.repo<WebhookDelivery>("webhookDelivery");
        const now: Date = new Date();
        const pending = ModelUtils.literal(WebhookDeliveryStatus.PENDING);
        const due: WebhookDelivery[] = await deliveries.find(
            {
                $or: [
                    { status: pending, nextAttemptAt: ModelUtils.literal(now, "lte"), leaseExpiresAt: ModelUtils.literal(null) },
                    { status: pending, nextAttemptAt: ModelUtils.literal(now, "lte"), leaseExpiresAt: ModelUtils.literal(now, "lt") },
                ],
                sort: { nextAttemptAt: "ASC" },
            },
            { ignoreACL: true, limit: 100, skipCache: true },
        );
        const endpoints: Map<string, WebhookEndpoint | undefined> = new Map();
        for (const candidate of due) {
            try {
                const claimed: WebhookDelivery = await deliveries.update(
                    { uid: candidate.uid, version: candidate.version, leaseExpiresAt: new Date(Date.now() + 60_000) },
                    candidate,
                    { ignoreACL: true, skipPush: true },
                );
                if (!endpoints.has(claimed.endpointUid)) {
                    endpoints.set(claimed.endpointUid, await (await this.repo<WebhookEndpoint>("webhookEndpoint")).findOne(claimed.endpointUid, { ignoreACL: true, skipCache: true }));
                }
                const endpoint: WebhookEndpoint | undefined = endpoints.get(claimed.endpointUid);
                if (!endpoint?.enabled) {
                    await this.finish(claimed, { status: WebhookDeliveryStatus.FAILED, lastError: "The endpoint is switched off." });
                    continue;
                }
                endpoints.set(endpoint.uid, await this.deliver(claimed, endpoint));
            } catch (err: any) {
                if (!/version/i.test(err?.message ?? "")) {
                    this.logger?.error(`WebhookDeliveryJob: delivery ${candidate.uid} failed: ${err?.message ?? err}`);
                }
            }
        }
        await deliveries.truncate(
            { status: ModelUtils.literal(WebhookDeliveryStatus.PENDING, "ne"), dateModified: ModelUtils.literal(new Date(Date.now() - this.retentionDays * 86_400_000), "lt") },
            { ignoreACL: true },
        );
    }

    /** Posts one delivery and records what came of it on it and its endpoint. Returns the endpoint as saved. */
    private async deliver(delivery: WebhookDelivery, endpoint: WebhookEndpoint): Promise<WebhookEndpoint> {
        const body: string = JSON.stringify(delivery.payload);
        let status: number | undefined;
        let error: string | undefined;
        if (Buffer.byteLength(body) > MAX_PAYLOAD_BYTES) {
            error = "The payload is too big to send.";
        } else {
            try {
                status = (await this.post(endpoint.url, body, endpoint.secret)).status;
                if (status < 200 || status >= 300) {
                    error = `The endpoint answered ${status}.`;
                }
            } catch (err: any) {
                error = String(err?.message ?? err).slice(0, 500);
            }
        }
        const endpoints: RepoUtils<WebhookEndpoint> = await this.repo<WebhookEndpoint>("webhookEndpoint");
        if (!error) {
            await this.finish(delivery, { status: WebhookDeliveryStatus.DELIVERED, responseStatus: status, deliveredAt: new Date(), lastError: null } as any);
            return await endpoints.update({ uid: endpoint.uid, version: endpoint.version, failureCount: 0, lastDeliveryAt: new Date(), lastError: null } as any, endpoint, {
                ignoreACL: true,
                skipPush: true,
            });
        }
        const attempts: number = delivery.attempts + 1;
        await this.finish(
            delivery,
            attempts >= this.maxAttempts
                ? ({ status: WebhookDeliveryStatus.FAILED, attempts, responseStatus: status, lastError: error })
                : ({ attempts, responseStatus: status, lastError: error, nextAttemptAt: new Date(Date.now() + 60_000 * 2 ** (attempts - 1)) }),
        );
        const failureCount: number = endpoint.failureCount + 1;
        return await endpoints.update(
            { uid: endpoint.uid, version: endpoint.version, failureCount, lastError: error, ...(failureCount >= MAX_ENDPOINT_FAILURES ? { enabled: false } : {}) },
            endpoint,
            { ignoreACL: true, skipPush: true },
        );
    }

    private async finish(delivery: WebhookDelivery, changes: Partial<WebhookDelivery>): Promise<void> {
        await (await this.repo<WebhookDelivery>("webhookDelivery")).update({ ...changes, leaseExpiresAt: null, uid: delivery.uid, version: delivery.version } as any, delivery, {
            ignoreACL: true,
            skipPush: true,
        });
    }
}
