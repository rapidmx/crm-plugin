///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { type JWTUser } from "@rapidrest/core";
import { ModelUtils, RouteDecorators } from "@rapidrest/service-core";
import { CrmContact, Subscription, SubscriptionStatus, WorkspaceAction } from "../models/types.js";
import { badRequest, readPaging, requireObject } from "../util/Validation.js";
import { CrmRouteBase } from "./CrmRouteBase.js";
const { Get, Param, Post, Query, User: AuthUser } = RouteDecorators;

/** How many contacts one subscription request may change. */
export const MAX_SUBSCRIPTION_BATCH = 500;

/**
 * Contacts' subscriptions to a workspace's lists (`/api/mail/crm/subscriptions`):
 * - `GET /:workspaceUid` - subscriptions, newest first, narrowed by `listUid`, `contactUid` and `status`.
 * - `POST /:workspaceUid` - `{ listUid, contactUids, status }` subscribes (`subscribed`) or unsubscribes (`unsubscribed`) up to
 * `MAX_SUBSCRIPTION_BATCH` contacts at once, as a member (source `manual`). A member can't make a subscription pending: only a
 * form's double opt-in does that.
 *
 * Reading takes `READ` on the workspace, changing `WRITE`.
 */
export abstract class BaseSubscriptionRoute extends CrmRouteBase {
    @Get("/:workspaceUid")
    public async list(
        @Param("workspaceUid") workspaceUid: string,
        @Query() query: Record<string, unknown> | undefined,
        @AuthUser user?: JWTUser,
    ): Promise<Subscription[]> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        const paging = readPaging(query?.limit, query?.page, 500);
        const conditions: Record<string, unknown> = { workspaceUid: ModelUtils.literal(workspaceUid), sort: { dateCreated: "DESC" } };
        for (const field of ["listUid", "contactUid"]) {
            const value: unknown = query?.[field];
            if (typeof value === "string" && value.length > 0 && value.length <= 64) {
                conditions[field] = ModelUtils.literal(value);
            }
        }
        if (Object.values(SubscriptionStatus).includes(query?.status as SubscriptionStatus)) {
            conditions.status = ModelUtils.literal(query!.status);
        }
        const subscriptions: Subscription[] = await (await this.repo<Subscription>("subscription")).find(conditions, {
            ignoreACL: true,
            limit: paging.limit,
            page: paging.page,
            skipCache: true,
        });
        return JSON.parse(JSON.stringify(subscriptions));
    }

    @Post("/:workspaceUid")
    public async change(@Param("workspaceUid") workspaceUid: string, body: unknown, @AuthUser user?: JWTUser): Promise<{ changed: number }> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.WRITE);
        const request: Record<string, unknown> = requireObject(body);
        if (!(await this.findList(workspaceUid, request.listUid))) {
            throw badRequest("'listUid' must be a list of the workspace.");
        }
        const status: unknown = request.status;
        if (status !== SubscriptionStatus.SUBSCRIBED && status !== SubscriptionStatus.UNSUBSCRIBED) {
            throw badRequest("'status' must be subscribed or unsubscribed.");
        }
        const uids: unknown = request.contactUids;
        if (!Array.isArray(uids) || uids.length === 0 || uids.length > MAX_SUBSCRIPTION_BATCH || uids.some((uid) => typeof uid !== "string")) {
            throw badRequest(`'contactUids' must be a list of 1 to ${MAX_SUBSCRIPTION_BATCH} contact uids.`);
        }
        const contacts: CrmContact[] = await (await this.repo<CrmContact>("contact")).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), uid: ModelUtils.literal([...new Set(uids as string[])], "in") },
            { ignoreACL: true, limit: MAX_SUBSCRIPTION_BATCH, skipCache: true },
        );
        for (const contact of contacts) {
            await this.setSubscription(workspaceUid, request.listUid as string, contact.uid, status, {
                source: "manual",
                actorUserUid: user!.uid.toLowerCase(),
            });
        }
        return { changed: contacts.length };
    }
}
