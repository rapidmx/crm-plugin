///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { CrmObjectType, CrmTask, TaskPriority, TaskStatus } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `CrmTask` interface for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.CrmTaskSQL` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
@Entity()
@Description("A to-do for a CRM workspace member.")
@Index("crm_task_workspace_status_due", ["workspaceUid", "status", "dueAt"])
@Index("crm_task_workspace_assignee", ["workspaceUid", "assigneeUserUid"])
@Index("crm_task_subject", ["workspaceUid", "subjectUid"])
@Index("crm_task_due", ["status", "dueAt"])
@Protect(
    {
        uid: "CrmTask",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class CrmTaskMongo extends BaseMongoEntity implements CrmTask {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("What to do.")
    public title: string = "";

    @Column({ nullable: true })
    @Description("Details.")
    @Nullable
    public notes?: string;

    @Column()
    @Description("Whether the task is done.")
    public status: TaskStatus = TaskStatus.OPEN;

    @Column()
    @Description("How urgent the task is.")
    public priority: TaskPriority = TaskPriority.NORMAL;

    @Column({ nullable: true })
    @Description("When the task is due.")
    @Nullable
    public dueAt?: Date;

    @Column({ nullable: true })
    @Description("Who the task is for.")
    @Nullable
    public assigneeUserUid?: string;

    @Column({ nullable: true })
    @Description("The kind of record the task is about.")
    @Nullable
    public subjectType?: CrmObjectType;

    @Column({ nullable: true })
    @Description("The record the task is about.")
    @Nullable
    public subjectUid?: string;

    @Column({ nullable: true })
    @Description("When the task was done.")
    @Nullable
    public completedAt?: Date;

    @Column()
    @Description("Who created the task.")
    public createdByUserUid: string = "";

    @Column({ nullable: true })
    @Description("When the assignee was reminded.")
    @Nullable
    public remindedAt?: Date;

    constructor(other?: Partial<CrmTaskMongo>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.title = other.title !== undefined ? other.title : this.title;
            this.notes = "notes" in other ? other.notes : this.notes;
            this.status = other.status !== undefined ? other.status : this.status;
            this.priority = other.priority !== undefined ? other.priority : this.priority;
            this.dueAt = "dueAt" in other ? other.dueAt : this.dueAt;
            this.assigneeUserUid = "assigneeUserUid" in other ? other.assigneeUserUid : this.assigneeUserUid;
            this.subjectType = "subjectType" in other ? other.subjectType : this.subjectType;
            this.subjectUid = "subjectUid" in other ? other.subjectUid : this.subjectUid;
            this.completedAt = "completedAt" in other ? other.completedAt : this.completedAt;
            this.createdByUserUid = other.createdByUserUid !== undefined ? other.createdByUserUid : this.createdByUserUid;
            this.remindedAt = "remindedAt" in other ? other.remindedAt : this.remindedAt;
        }
    }
}
