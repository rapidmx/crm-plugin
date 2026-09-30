///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { ModelUtils, RepoUtils } from "@rapidrest/service-core";
import { CrmTask, TaskStatus } from "../models/types.js";
import { CrmJobBase } from "./CrmJobBase.js";
const { Config } = ObjectDecorators;

/**
 * Reminds members of their tasks: once an open task with an assignee is due within `mail:crm:jobs:reminders:lead_minutes`, its
 * assignee gets a `CrmTaskDue` push message (the web client shows it), once - the task is stamped `remindedAt` (version-checked, so
 * one replica sends it). A task given a new due date or assignee is reminded again.
 */
export abstract class TaskReminderJob extends CrmJobBase {
    @Config("mail:crm:jobs:reminders:schedule", "15 * * * * *")
    protected scheduleExpr: string = "15 * * * * *";

    @Config("mail:crm:jobs:reminders:lead_minutes", 15)
    protected leadMinutes: number = 15;

    public get schedule(): string | undefined {
        return this.scheduleExpr;
    }

    public async run(): Promise<void> {
        const tasks: RepoUtils<CrmTask> = await this.repo<CrmTask>("task");
        const due: CrmTask[] = await tasks.find(
            {
                status: ModelUtils.literal(TaskStatus.OPEN),
                dueAt: ModelUtils.literal(new Date(Date.now() + this.leadMinutes * 60_000), "lte"),
                remindedAt: ModelUtils.literal(null),
                assigneeUserUid: ModelUtils.literal(null, "ne"),
                sort: { dueAt: "ASC" },
            },
            { ignoreACL: true, limit: 200, skipCache: true },
        );
        for (const task of due) {
            try {
                const reminded: CrmTask = await tasks.update({ uid: task.uid, version: task.version, remindedAt: new Date() }, task, { ignoreACL: true, skipPush: true });
                this.notificationUtils?.sendMessage(reminded.assigneeUserUid!, "CrmTaskDue", "create", {
                    workspaceUid: reminded.workspaceUid,
                    taskUid: reminded.uid,
                    title: reminded.title,
                    dueAt: reminded.dueAt,
                    subjectType: reminded.subjectType,
                    subjectUid: reminded.subjectUid,
                });
            } catch (err: any) {
                if (!/version/i.test(err?.message ?? "")) {
                    this.logger?.error(`TaskReminderJob: task ${task.uid} failed: ${err?.message ?? err}`);
                }
            }
        }
    }
}
