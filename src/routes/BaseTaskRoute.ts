///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils } from "@rapidrest/service-core";
import { CrmTask, TaskPriority, TaskStatus, TimelineKind } from "../models/types.js";
import { MAX_LONG_TEXT, badRequest, readDate, readEnum, readText } from "../util/Validation.js";
import { BaseWorkspaceRecordRoute, WriteContext } from "./BaseWorkspaceRecordRoute.js";

/**
 * A workspace's tasks (`/api/mail/crm/tasks`) - see `BaseWorkspaceRecordRoute` for the endpoints. `GET /:workspaceUid` takes `status`,
 * `assigneeUserUid` and `subjectUid`. A task is assigned to a member (its creator unless it says otherwise) and may be about a
 * contact or company, whose timeline then shows it being created and done. Marking a task `done` stamps `completedAt`; reopening it
 * clears it.
 */
export abstract class BaseTaskRoute extends BaseWorkspaceRecordRoute<CrmTask> {
    protected readonly model = "task" as const;
    protected readonly pushType: string = "CrmTask";
    protected override readonly sortFields: readonly string[] = ["dueAt", "priority", "status", "title"];

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<CrmTask>> {
        const fields: Partial<CrmTask> = await this.readFields(body, context);
        if (!fields.title) {
            throw badRequest("'title' is required.");
        }
        if (body.subjectType !== undefined || body.subjectUid !== undefined) {
            Object.assign(fields, await this.requireSubject(context.workspaceUid, body.subjectType, body.subjectUid));
        }
        fields.assigneeUserUid ??= context.user.uid.toLowerCase();
        fields.createdByUserUid = context.user.uid.toLowerCase();
        if (fields.status === TaskStatus.DONE) {
            fields.completedAt = new Date();
        }
        return fields;
    }

    protected async readUpdate(body: Record<string, unknown>, existing: CrmTask, context: WriteContext): Promise<Partial<CrmTask>> {
        const fields: Partial<CrmTask> = await this.readFields(body, context);
        if (fields.title === null) {
            throw badRequest("'title' is required.");
        }
        if (body.subjectType === null || body.subjectUid === null) {
            (fields as any).subjectType = null;
            (fields as any).subjectUid = null;
        } else if (body.subjectType !== undefined || body.subjectUid !== undefined) {
            Object.assign(
                fields,
                await this.requireSubject(context.workspaceUid, body.subjectType ?? existing.subjectType, body.subjectUid ?? existing.subjectUid),
            );
        }
        if (fields.status && fields.status !== existing.status) {
            (fields as any).completedAt = fields.status === TaskStatus.DONE ? new Date() : null;
        }
        // A new due date, or a new assignee, gets its own reminder.
        if (("dueAt" in fields && String(fields.dueAt) !== String(existing.dueAt)) || ("assigneeUserUid" in fields && fields.assigneeUserUid !== existing.assigneeUserUid)) {
            (fields as any).remindedAt = null;
        }
        return fields;
    }

    private async readFields(body: Record<string, unknown>, context: WriteContext): Promise<Partial<CrmTask>> {
        const fields: Record<string, unknown> = {};
        const title: string | null | undefined = readText(body, "title");
        if (title !== undefined) {
            fields.title = title;
        }
        const notes: string | null | undefined = readText(body, "notes", { max: MAX_LONG_TEXT });
        if (notes !== undefined) {
            fields.notes = notes;
        }
        const status = readEnum(body, "status", Object.values(TaskStatus));
        if (status) {
            fields.status = status;
        }
        const priority = readEnum(body, "priority", Object.values(TaskPriority));
        if (priority) {
            fields.priority = priority;
        }
        const dueAt: Date | null | undefined = readDate(body, "dueAt");
        if (dueAt !== undefined) {
            fields.dueAt = dueAt;
        }
        if (body.assigneeUserUid !== undefined) {
            fields.assigneeUserUid = await this.requireMemberUid(context.workspaceUid, readText(body, "assigneeUserUid", { max: 128 }), "assigneeUserUid");
        }
        return fields;
    }

    protected override async afterWrite(record: CrmTask, before: CrmTask | undefined, _body: Record<string, unknown>, context: WriteContext): Promise<void> {
        if (!record.subjectType || !record.subjectUid) {
            return;
        }
        const completed: boolean = record.status === TaskStatus.DONE && before?.status !== TaskStatus.DONE;
        if (!before || completed) {
            await this.addTimeline({
                workspaceUid: context.workspaceUid,
                subjectType: record.subjectType,
                subjectUid: record.subjectUid,
                kind: completed ? TimelineKind.TASK_COMPLETED : TimelineKind.TASK_CREATED,
                summary: `${completed ? "Completed" : "Created"} the task "${record.title}"`,
                actorUserUid: context.user.uid.toLowerCase(),
                refUid: record.uid,
            });
        }
    }

    protected override listQuery(query: Record<string, unknown>): Record<string, unknown> {
        const conditions: Record<string, unknown> = {};
        if (Object.values(TaskStatus).includes(query.status as TaskStatus)) {
            conditions.status = ModelUtils.literal(query.status);
        }
        for (const field of ["assigneeUserUid", "subjectUid"]) {
            const value: unknown = query[field];
            if (typeof value === "string" && value.length > 0 && value.length <= 128) {
                conditions[field] = ModelUtils.literal(field === "assigneeUserUid" ? value.toLowerCase() : value);
            }
        }
        return conditions;
    }
}
