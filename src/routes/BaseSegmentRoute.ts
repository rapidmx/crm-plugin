///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils, RouteDecorators } from "@rapidrest/service-core";
import type { JWTUser } from "@rapidrest/core";
import { FilterNode } from "../filters/Filter.js";
import { CrmContact, Segment, SegmentKind, WorkspaceAction } from "../models/types.js";
import { SEGMENTS_KEY, matchingContacts, readSegmentFilter, recordSegmentEvents, refreshSegment } from "../segments/Segments.js";
import { badRequest, readEnum, readText, requireObject } from "../util/Validation.js";
import { BaseWorkspaceRecordRoute, WriteContext } from "./BaseWorkspaceRecordRoute.js";
const { Param, Post, User: AuthUser } = RouteDecorators;

/** How many segments one workspace may have. */
export const MAX_SEGMENTS = 200;

/** How many contacts a preview shows. */
const PREVIEW_SIZE = 10;

/**
 * A workspace's segments (`/api/mail/crm/segments`) - see `BaseWorkspaceRecordRoute` for the endpoints - plus:
 * - `POST /:workspaceUid/preview` - `{ filter }` to `{ count, capped, contacts }`: how many contacts a filter matches now, and the
 * first few, for the segment editor.
 * - `POST /:workspaceUid/:uid/refresh` - works the members out again now (a static segment's only way to change).
 *
 * Members are worked out when a segment is created and whenever its filter or kind changes; `SegmentRefreshJob` keeps dynamic ones
 * current after that. A segment's filter may not name segments.
 */
export abstract class BaseSegmentRoute extends BaseWorkspaceRecordRoute<Segment> {
    protected readonly model = "segment" as const;
    protected readonly pushType: string = "CrmSegment";
    protected override readonly sortFields: readonly string[] = ["name", "memberCount"];
    protected override readonly maxRecords: number = MAX_SEGMENTS;

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<Segment>> {
        return {
            name: readText(body, "name", { required: true })!,
            description: readText(body, "description", { max: 2000 }) ?? undefined,
            kind: readEnum(body, "kind", Object.values(SegmentKind)) ?? SegmentKind.DYNAMIC,
            filter: await readSegmentFilter(this.repos(), context.workspaceUid, body.filter),
            memberCount: 0,
            capped: false,
            createdByUserUid: context.user.uid,
        };
    }

    protected async readUpdate(body: Record<string, unknown>, _existing: Segment, context: WriteContext): Promise<Partial<Segment>> {
        const fields: Record<string, unknown> = {};
        const name: string | null | undefined = readText(body, "name");
        if (name === null) {
            throw badRequest("'name' is required.");
        }
        if (name !== undefined) {
            fields.name = name;
        }
        if (body.description !== undefined) {
            fields.description = readText(body, "description", { max: 2000 });
        }
        const kind = readEnum(body, "kind", Object.values(SegmentKind));
        if (kind) {
            fields.kind = kind;
        }
        if (body.filter !== undefined) {
            fields.filter = await readSegmentFilter(this.repos(), context.workspaceUid, body.filter);
        }
        return fields;
    }

    /** A new segment, or one whose filter or kind changed, gets its members at once. */
    protected override async afterWrite(record: Segment, before: Segment | undefined): Promise<Segment | void> {
        if (!before || JSON.stringify(before.filter) !== JSON.stringify(record.filter) || before.kind !== record.kind) {
            return await this.refresh(record);
        }
    }

    protected override async afterDelete(record: Segment): Promise<void> {
        await (await this.repo("propertyValue")).truncate(
            { workspaceUid: ModelUtils.literal(record.workspaceUid), key: ModelUtils.literal(SEGMENTS_KEY), stringValue: ModelUtils.literal(record.uid) },
            { ignoreACL: true },
        );
    }

    /**
     * Works `segment`'s members out and saves the counts. Returns the segment as saved. With `events`, who entered and left is
     * recorded for automations - not on a segment's first working out, or everyone in it would count as just entered.
     */
    private async refresh(segment: Segment, events: boolean = false): Promise<Segment> {
        const { counts, entered, left } = await refreshSegment(this.repos(), this.classes, segment);
        if (events) {
            await recordSegmentEvents(this.repos(), this.classes, segment, entered, left, this.logger);
        }
        const records = await this.records();
        const current: Segment = (await records.findOne(segment.uid, { ignoreACL: true, skipCache: true }))!;
        return await records.update({ ...counts, uid: current.uid, version: current.version }, current, { ignoreACL: true, skipPush: true });
    }

    @Post("/:workspaceUid/preview")
    public async preview(
        @Param("workspaceUid") workspaceUid: string,
        body: unknown,
        @AuthUser user?: JWTUser,
    ): Promise<{ count: number; capped: boolean; contacts: Pick<CrmContact, "uid" | "email" | "firstName" | "lastName">[] }> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        const filter: FilterNode = await readSegmentFilter(this.repos(), workspaceUid, requireObject(body).filter);
        const { uids, capped } = await matchingContacts(this.repos(), workspaceUid, filter);
        const sample: CrmContact[] =
            uids.length === 0
                ? []
                : await (await this.repo<CrmContact>("contact")).find(
                      { uid: ModelUtils.literal(uids.slice(0, PREVIEW_SIZE), "in"), sort: { email: "ASC" } },
                      { ignoreACL: true, limit: PREVIEW_SIZE, skipCache: true },
                  );
        return {
            count: uids.length,
            capped,
            contacts: sample.map(({ uid, email, firstName, lastName }) => ({ uid, email, firstName, lastName })),
        };
    }

    @Post("/:workspaceUid/:uid/refresh")
    public async refreshNow(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<Segment> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.WRITE);
        const saved: Segment = await this.refresh(await this.requireRecord(workspaceUid, uid), true);
        const view: Segment = JSON.parse(JSON.stringify(saved));
        this.notify(workspaceUid, this.pushType, "update", view);
        return view;
    }
}
