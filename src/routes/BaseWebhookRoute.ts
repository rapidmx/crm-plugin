///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils, RouteDecorators } from "@rapidrest/service-core";
import type { JWTUser } from "@rapidrest/core";
import { CrmEventType } from "../automation/Events.js";
import { WebhookDelivery, WebhookEndpoint, WorkspaceAction } from "../models/types.js";
import { payloadId } from "../webhooks/Deliveries.js";
import { WebhookPoster, checkWebhookUrl, newWebhookSecret, postWebhook } from "../webhooks/Webhooks.js";
import { badRequest, readBoolean, readText } from "../util/Validation.js";
import { BaseWorkspaceRecordRoute, WriteContext } from "./BaseWorkspaceRecordRoute.js";
const { Get, Param, Post, User: AuthUser } = RouteDecorators;

/** How many webhook endpoints one workspace may have. */
export const MAX_WEBHOOKS = 20;
/** The event types an endpoint may take, besides `*` (all). */
export const WEBHOOK_EVENTS: readonly string[] = [...Object.values(CrmEventType).filter((type) => type !== CrmEventType.MANUAL && type !== CrmEventType.DATE_REACHED), "automation.webhook"];

/** An endpoint as the API shows it: its secret only as its last characters. */
export interface WebhookEndpointView extends Omit<WebhookEndpoint, "secret"> {
    secretHint: string;
}

/**
 * A workspace's webhook endpoints (`/api/mail/crm/webhooks`) - see `BaseWorkspaceRecordRoute` for the endpoints; changing them takes
 * `MANAGE` - plus:
 * - `POST /:workspaceUid/:uid/secret` - makes a new signing secret and answers it (`{ secret }`), the only time it is shown in full
 * besides creation (`POST` answers `secret` once).
 * - `POST /:workspaceUid/:uid/test` - posts a `ping` now and answers `{ status }` or `{ error }`.
 * - `GET /:workspaceUid/:uid/deliveries` - the 50 latest deliveries.
 *
 * Addresses must be `https://` on the public internet (checked again, by resolving the host, whenever something is sent). Switching
 * an endpoint back on clears its failure count.
 */
export abstract class BaseWebhookRoute extends BaseWorkspaceRecordRoute<WebhookEndpoint, WebhookEndpointView> {
    protected readonly model = "webhookEndpoint" as const;
    protected readonly pushType: string = "CrmWebhook";
    protected override readonly writeAction: WorkspaceAction = WorkspaceAction.MANAGE;
    protected override readonly maxRecords: number = MAX_WEBHOOKS;

    /** How a webhook is posted - a seam for tests. */
    protected post: WebhookPoster = postWebhook;

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<WebhookEndpoint>> {
        return {
            url: this.readUrl(body, true)!,
            events: this.readEvents(body) ?? ["*"],
            secret: newWebhookSecret(),
            enabled: readBoolean(body, "enabled") ?? true,
            description: readText(body, "description", { max: 500 }) ?? undefined,
            failureCount: 0,
            createdByUserUid: context.user.uid,
        };
    }

    protected async readUpdate(body: Record<string, unknown>, existing: WebhookEndpoint): Promise<Partial<WebhookEndpoint>> {
        const fields: Record<string, unknown> = {};
        const url: string | undefined = this.readUrl(body, false);
        if (url) {
            fields.url = url;
        }
        const events: string[] | undefined = this.readEvents(body);
        if (events) {
            fields.events = events;
        }
        const enabled: boolean | undefined = readBoolean(body, "enabled");
        if (enabled !== undefined) {
            fields.enabled = enabled;
            if (enabled && !existing.enabled) {
                fields.failureCount = 0;
            }
        }
        if (body.description !== undefined) {
            fields.description = readText(body, "description", { max: 500 });
        }
        return fields;
    }

    private readUrl(body: Record<string, unknown>, required: boolean): string | undefined {
        const url: string | null | undefined = readText(body, "url", { required, max: 2000 });
        if (url === null) {
            throw badRequest("'url' is required.");
        }
        if (url !== undefined) {
            try {
                checkWebhookUrl(url);
            } catch (err: any) {
                throw badRequest(`'url': ${err.message}`);
            }
        }
        return url;
    }

    private readEvents(body: Record<string, unknown>): string[] | undefined {
        if (body.events === undefined) {
            return undefined;
        }
        if (
            !Array.isArray(body.events) ||
            body.events.length === 0 ||
            body.events.some((type) => typeof type !== "string" || (type !== "*" && !WEBHOOK_EVENTS.includes(type)))
        ) {
            throw badRequest(`'events' must list event types (${WEBHOOK_EVENTS.join(", ")}), or be ["*"].`);
        }
        return [...new Set(body.events as string[])];
    }

    protected override async toViews(records: WebhookEndpoint[]): Promise<WebhookEndpointView[]> {
        return records.map(({ secret, ...record }) => ({ ...JSON.parse(JSON.stringify(record)), secretHint: `…${secret.slice(-4)}` }));
    }

    /** A new endpoint's secret is answered once, with it. */
    public override async create(workspaceUid: string, body: unknown, user?: JWTUser): Promise<WebhookEndpointView & { secret?: string }> {
        const view: WebhookEndpointView = await super.create(workspaceUid, body, user);
        const record: WebhookEndpoint = await this.requireRecord(workspaceUid, view.uid);
        return { ...view, secret: record.secret };
    }

    @Post("/:workspaceUid/:uid/secret")
    public async rotateSecret(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<{ secret: string }> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.MANAGE);
        const endpoint: WebhookEndpoint = await this.requireRecord(workspaceUid, uid);
        const secret: string = newWebhookSecret();
        await (await this.records()).update({ uid: endpoint.uid, version: endpoint.version, secret }, endpoint, { ignoreACL: true, skipPush: true });
        return { secret };
    }

    @Post("/:workspaceUid/:uid/test")
    public async test(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<{ status?: number; error?: string }> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.MANAGE);
        const endpoint: WebhookEndpoint = await this.requireRecord(workspaceUid, uid);
        const body: string = JSON.stringify({ id: payloadId(), type: "ping", occurredAt: new Date().toISOString(), workspaceUid, data: {} });
        try {
            return { status: (await this.post(endpoint.url, body, endpoint.secret)).status };
        } catch (err: any) {
            return { error: String(err?.message ?? err) };
        }
    }

    @Get("/:workspaceUid/:uid/deliveries")
    public async deliveries(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<WebhookDelivery[]> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        const endpoint: WebhookEndpoint = await this.requireRecord(workspaceUid, uid);
        const deliveries: WebhookDelivery[] = await (await this.repo<WebhookDelivery>("webhookDelivery")).find(
            { endpointUid: ModelUtils.literal(endpoint.uid), sort: { dateCreated: "DESC" } },
            { ignoreACL: true, limit: 50, skipCache: true },
        );
        return JSON.parse(JSON.stringify(deliveries));
    }

    protected override async afterDelete(record: WebhookEndpoint): Promise<void> {
        await (await this.repo("webhookDelivery")).truncate({ endpointUid: ModelUtils.literal(record.uid) }, { ignoreACL: true, skipPush: true });
    }
}
