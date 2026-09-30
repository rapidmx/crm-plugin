///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { type JWTUser } from "@rapidrest/core";
import { ModelUtils, RouteDecorators } from "@rapidrest/service-core";
import { CrmObjectType, TimelineEvent, WorkspaceAction } from "../models/types.js";
import { readPaging } from "../util/Validation.js";
import { CrmRouteBase } from "./CrmRouteBase.js";
const { Get, Param, Query, User: AuthUser } = RouteDecorators;

/**
 * A contact's or company's activity timeline (`/api/mail/crm/timeline`): `GET /:workspaceUid/:subjectType/:subjectUid`, newest first,
 * a page at a time (`limit`, `page`). Read-only: entries are added by the changes they record.
 */
export abstract class BaseTimelineRoute extends CrmRouteBase {
    @Get("/:workspaceUid/:subjectType/:subjectUid")
    public async list(
        @Param("workspaceUid") workspaceUid: string,
        @Param("subjectType") subjectType: string,
        @Param("subjectUid") subjectUid: string,
        @Query() query: Record<string, unknown> | undefined,
        @AuthUser user?: JWTUser,
    ): Promise<TimelineEvent[]> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        await this.requireSubject(workspaceUid, subjectType, subjectUid);
        const paging = readPaging(query?.limit, query?.page);
        const events: TimelineEvent[] = await (await this.repo<TimelineEvent>("timelineEvent")).find(
            {
                workspaceUid: ModelUtils.literal(workspaceUid),
                subjectType: ModelUtils.literal(subjectType),
                subjectUid: ModelUtils.literal(subjectUid),
                sort: { occurredAt: "DESC" },
            },
            { ignoreACL: true, limit: paging.limit, page: paging.page, skipCache: true },
        );
        return JSON.parse(JSON.stringify(events));
    }
}
