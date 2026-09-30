///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ApiErrors, HttpRequest, ModelUtils, RateLimiter, RouteDecorators } from "@rapidrest/service-core";
import { ApiError, ObjectDecorators } from "@rapidrest/core";
import { CrmEventType, recordCrmEvent } from "../automation/Events.js";
import { ApiKey, ApiKeyScope, CrmContact, EmailStatus, MailingList, Subscription, SubscriptionStatus } from "../models/types.js";
import type { BaseContactRoute } from "./BaseContactRoute.js";
import { hashApiKey } from "./BaseApiKeyRoute.js";
import { CrmRouteBase } from "./CrmRouteBase.js";
import { badRequest, isObject, readEmail, readText, requireObject } from "../util/Validation.js";
const { Inject } = ObjectDecorators;
const { Get, Param, Post, Request } = RouteDecorators;

/** How many calls one key may make a minute. */
export const API_KEY_RATE = 600;
/** The largest `data` a custom event may carry, as JSON. */
const MAX_EVENT_DATA = 16 * 1024;

/**
 * The API a workspace's own systems call (`/api/mail/crm/integrations/:workspaceUid/...`), with a workspace API key as
 * `Authorization: Bearer crm_...` rather than a member's session - each endpoint needs its key's scope:
 * - `POST /contacts` (`contacts`) - creates or updates the contact with `email`: `{ email, firstName?, lastName?, ..., tags?,
 * properties? }` to `{ outcome, uid }`.
 * - `POST /subscribe` (`subscriptions`) - `{ email, listUid, ...contact fields }`: subscribes the contact (creating it), consent
 * vouched for by the caller.
 * - `POST /unsubscribe` (`subscriptions`) - `{ email, listUid? }`: from one list, or from every list and all email.
 * - `POST /events` (`events`) - `{ email, name, data? }`: records a `custom` event automations can start from (creating the contact).
 * - `GET /lists` (any scope) - the workspace's lists.
 *
 * A missing, unknown or revoked key is a 401; one without the scope a 403. Each key may make `API_KEY_RATE` calls a minute.
 */
export abstract class BaseIntegrationRoute extends CrmRouteBase {
    protected abstract contactRouteClass: any;

    @Inject(RateLimiter)
    protected rateLimiter?: RateLimiter;

    private contactRoute?: BaseContactRoute;

    private async contacts(): Promise<BaseContactRoute> {
        this.contactRoute ??= await this._objectFactory!.newInstance(this.contactRouteClass, { name: "crm-integrations" });
        return this.contactRoute;
    }

    /** The key of the request, if it is one of the workspace's, unrevoked and holding `scope` - else a 401 or 403. */
    private async requireKey(req: HttpRequest, workspaceUid: string, scope?: ApiKeyScope): Promise<ApiKey> {
        const header: unknown = (req as any).headers?.authorization;
        const match: RegExpExecArray | null = typeof header === "string" ? /^Bearer (crm_[A-Za-z0-9_-]{20,100})$/.exec(header.trim()) : null;
        const repo = await this.repo<ApiKey>("apiKey");
        const key: ApiKey | undefined = match ? (await repo.find({ hash: ModelUtils.literal(hashApiKey(match[1])) }, { ignoreACL: true, limit: 1, skipCache: true }))[0] : undefined;
        if (!key || key.workspaceUid !== workspaceUid || key.revokedAt) {
            throw new ApiError(ApiErrors.AUTH_FAILED, 401, "A valid API key of the workspace is required.");
        }
        if (scope && !key.scopes.includes(scope)) {
            throw new ApiError(ApiErrors.AUTH_PERMISSION_FAILURE, 403, `This API key can't do that: it needs the "${scope}" scope.`);
        }
        await this.rateLimiter?.checkAndIncrement(`crm-api|${key.uid}`, { maxAttempts: API_KEY_RATE, windowSeconds: 60, ip: { enabled: false } });
        if (!key.lastUsedAt || Date.now() - new Date(key.lastUsedAt).getTime() > 60_000) {
            /* v8 ignore next 5 -- only a concurrent call with the same key loses this race */
            try {
                await repo.update({ uid: key.uid, version: key.version, lastUsedAt: new Date() } as any, key, { ignoreACL: true, skipPush: true });
            } catch {
                // Another call stamped it first.
            }
        }
        return key;
    }

    /** Creates or updates the contact of a request's `email` and other contact fields. */
    private async upsertContact(workspaceUid: string, request: Record<string, unknown>): Promise<{ outcome: string; uid: string }> {
        readEmail(request, "email", { required: true });
        const { listUid: _list, name: _name, data: _data, ...fields } = request;
        return await (await this.contacts()).importRow(workspaceUid, "", fields, true);
    }

    @Post("/:workspaceUid/contacts")
    public async upsert(@Param("workspaceUid") workspaceUid: string, body: unknown, @Request req: HttpRequest): Promise<{ outcome: string; uid: string }> {
        await this.requireKey(req, workspaceUid, ApiKeyScope.CONTACTS);
        return await this.upsertContact(workspaceUid, requireObject(body));
    }

    @Post("/:workspaceUid/subscribe")
    public async subscribe(@Param("workspaceUid") workspaceUid: string, body: unknown, @Request req: HttpRequest): Promise<{ contactUid: string; status: string }> {
        await this.requireKey(req, workspaceUid, ApiKeyScope.SUBSCRIPTIONS);
        const request: Record<string, unknown> = requireObject(body);
        const list: MailingList | undefined = await this.findList(workspaceUid, request.listUid);
        if (!list) {
            throw badRequest("'listUid' must be a list of the workspace.");
        }
        const { uid } = await this.upsertContact(workspaceUid, request);
        const subscription: Subscription = await this.setSubscription(workspaceUid, list.uid, uid, SubscriptionStatus.SUBSCRIBED, { source: "api" });
        return { contactUid: uid, status: subscription.status };
    }

    @Post("/:workspaceUid/unsubscribe")
    public async unsubscribe(@Param("workspaceUid") workspaceUid: string, body: unknown, @Request req: HttpRequest): Promise<{ contactUid?: string }> {
        await this.requireKey(req, workspaceUid, ApiKeyScope.SUBSCRIPTIONS);
        const request: Record<string, unknown> = requireObject(body);
        const email: string = readEmail(request, "email", { required: true })!;
        const contacts = await this.repo<CrmContact>("contact");
        const contact: CrmContact | undefined = (
            await contacts.find({ workspaceUid: ModelUtils.literal(workspaceUid), email: ModelUtils.literal(email) }, { ignoreACL: true, limit: 1, skipCache: true })
        )[0];
        if (!contact) {
            return {};
        }
        if (request.listUid !== undefined) {
            const list: MailingList | undefined = await this.findList(workspaceUid, request.listUid);
            if (!list) {
                throw badRequest("'listUid' must be a list of the workspace.");
            }
            await this.setSubscription(workspaceUid, list.uid, contact.uid, SubscriptionStatus.UNSUBSCRIBED, { source: "api" });
            return { contactUid: contact.uid };
        }
        const subscribed: Subscription[] = await (await this.repo<Subscription>("subscription")).find(
            { contactUid: ModelUtils.literal(contact.uid), status: ModelUtils.literal(SubscriptionStatus.SUBSCRIBED) },
            { ignoreACL: true, limit: 1000, skipCache: true },
        );
        for (const subscription of subscribed) {
            await this.setSubscription(workspaceUid, subscription.listUid, contact.uid, SubscriptionStatus.UNSUBSCRIBED, { source: "api" });
        }
        if (contact.emailStatus === EmailStatus.ACTIVE) {
            await contacts.update({ uid: contact.uid, version: contact.version, emailStatus: EmailStatus.UNSUBSCRIBED } as any, contact, { ignoreACL: true, skipPush: true });
        }
        return { contactUid: contact.uid };
    }

    @Post("/:workspaceUid/events")
    public async event(@Param("workspaceUid") workspaceUid: string, body: unknown, @Request req: HttpRequest): Promise<{ contactUid: string }> {
        await this.requireKey(req, workspaceUid, ApiKeyScope.EVENTS);
        const request: Record<string, unknown> = requireObject(body);
        const name: string = readText(request, "name", { required: true, max: 100 })!;
        const data: unknown = request.data ?? {};
        if (!isObject(data) || JSON.stringify(data).length > MAX_EVENT_DATA) {
            throw badRequest(`'data' must be an object of at most ${MAX_EVENT_DATA / 1024} KB.`);
        }
        const { uid } = await this.upsertContact(workspaceUid, { email: request.email });
        await recordCrmEvent(this.repos(), this.classes, { workspaceUid, type: CrmEventType.CUSTOM, contactUid: uid, data: { ...data, name } }, this.logger);
        return { contactUid: uid };
    }

    @Get("/:workspaceUid/lists")
    public async lists(@Param("workspaceUid") workspaceUid: string, @Request req: HttpRequest): Promise<{ uid: string; name: string; publicName: string }[]> {
        await this.requireKey(req, workspaceUid);
        const lists: MailingList[] = await (await this.repo<MailingList>("mailingList")).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), sort: { name: "ASC" } },
            { ignoreACL: true, limit: 1000, skipCache: true },
        );
        return lists.map(({ uid, name, publicName }) => ({ uid, name, publicName }));
    }
}
