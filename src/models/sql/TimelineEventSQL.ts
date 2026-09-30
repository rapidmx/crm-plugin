///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { CrmObjectType, TimelineEvent } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `TimelineEvent` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.TimelineEventMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("One entry of a CRM record's activity timeline.")
@Index("crm_timeline_subject", ["workspaceUid", "subjectType", "subjectUid", "occurredAt"])
@Protect(
    {
        uid: "CrmTimelineEvent",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class TimelineEventSQL extends BaseEntity implements TimelineEvent {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column({ type: "varchar" })
    @Description("The kind of record the entry belongs to.")
    public subjectType: CrmObjectType = CrmObjectType.CONTACT;

    @Column()
    @Description("The record the entry belongs to.")
    public subjectUid: string = "";

    @Column()
    @Description("What the entry records.")
    public kind: string = "";

    @Column()
    @Description("When it happened.")
    public occurredAt: Date = new Date();

    @Column({ nullable: true })
    @Description("The member who did it, if a member did.")
    @Nullable
    public actorUserUid?: string;

    @Column({ type: "text" })
    @Description("A short sentence for the timeline.")
    public summary: string = "";

    @Column({ type: "simple-json" })
    @Description("Kind-specific details.")
    public data: Record<string, unknown> = {};

    @Column({ nullable: true })
    @Description("The record the entry is about, when it is another one.")
    @Nullable
    public refUid?: string;

    constructor(other?: Partial<TimelineEventSQL>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.subjectType = other.subjectType !== undefined ? other.subjectType : this.subjectType;
            this.subjectUid = other.subjectUid !== undefined ? other.subjectUid : this.subjectUid;
            this.kind = other.kind !== undefined ? other.kind : this.kind;
            this.occurredAt = other.occurredAt !== undefined ? other.occurredAt : this.occurredAt;
            this.actorUserUid = "actorUserUid" in other ? other.actorUserUid : this.actorUserUid;
            this.summary = other.summary !== undefined ? other.summary : this.summary;
            this.data = other.data !== undefined ? other.data : this.data;
            this.refUid = "refUid" in other ? other.refUid : this.refUid;
        }
    }
}
