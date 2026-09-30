///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils } from "@rapidrest/service-core";
import { CrmNote, TimelineKind } from "../models/types.js";
import { MAX_LONG_TEXT, badRequest, readBoolean, readText } from "../util/Validation.js";
import { BaseWorkspaceRecordRoute, WriteContext } from "./BaseWorkspaceRecordRoute.js";

/**
 * Notes on contacts and companies (`/api/mail/crm/notes`) - see `BaseWorkspaceRecordRoute` for the endpoints. `GET /:workspaceUid`
 * takes `subjectUid` to list one record's notes. A new note also goes on its record's timeline; deleting it takes it off.
 */
export abstract class BaseNoteRoute extends BaseWorkspaceRecordRoute<CrmNote> {
    protected readonly model = "note" as const;
    protected readonly pushType: string = "CrmNote";

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<CrmNote>> {
        const subject = await this.requireSubject(context.workspaceUid, body.subjectType, body.subjectUid);
        return {
            ...subject,
            body: readText(body, "body", { required: true, max: MAX_LONG_TEXT })!,
            pinned: readBoolean(body, "pinned") ?? false,
            authorUserUid: context.user.uid.toLowerCase(),
        };
    }

    protected async readUpdate(body: Record<string, unknown>, existing: CrmNote): Promise<Partial<CrmNote>> {
        if (
            (body.subjectType !== undefined && body.subjectType !== existing.subjectType) ||
            (body.subjectUid !== undefined && body.subjectUid !== existing.subjectUid)
        ) {
            throw badRequest("A note can't move to another record.");
        }
        const fields: Partial<CrmNote> = {};
        const text: string | null | undefined = readText(body, "body", { max: MAX_LONG_TEXT });
        if (text === null) {
            throw badRequest("'body' is required.");
        }
        if (text !== undefined) {
            fields.body = text;
        }
        const pinned: boolean | undefined = readBoolean(body, "pinned");
        if (pinned !== undefined) {
            fields.pinned = pinned;
        }
        return fields;
    }

    protected override async afterWrite(record: CrmNote, before: CrmNote | undefined, _body: Record<string, unknown>, context: WriteContext): Promise<void> {
        if (!before) {
            await this.addTimeline({
                workspaceUid: context.workspaceUid,
                subjectType: record.subjectType,
                subjectUid: record.subjectUid,
                kind: TimelineKind.NOTE,
                summary: record.body.length > 200 ? `${record.body.slice(0, 197)}...` : record.body,
                actorUserUid: record.authorUserUid,
                refUid: record.uid,
            });
        }
    }

    protected override async afterDelete(record: CrmNote, context: WriteContext): Promise<void> {
        await (await this.repo("timelineEvent")).truncate(
            { workspaceUid: ModelUtils.literal(context.workspaceUid), refUid: ModelUtils.literal(record.uid) },
            { ignoreACL: true, skipPush: true },
        );
    }

    protected override listQuery(query: Record<string, unknown>): Record<string, unknown> {
        return typeof query.subjectUid === "string" && query.subjectUid.length > 0 && query.subjectUid.length <= 64
            ? { subjectUid: ModelUtils.literal(query.subjectUid) }
            : {};
    }
}
