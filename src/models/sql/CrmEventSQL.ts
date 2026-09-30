///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { CrmEvent } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `CrmEvent` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.CrmEventMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("Something that happened to a CRM contact, for automations.")
@Index("crm_event_dispatch", ["dispatchedAt", "occurredAt"])
@Index("crm_event_workspace", ["workspaceUid"])
@Index("crm_event_contact", ["contactUid"])
@Protect(
    {
        uid: "CrmEvent",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class CrmEventSQL extends BaseEntity implements CrmEvent {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("What happened.")
    public type: string = "";

    @Column()
    @Description("The contact.")
    public contactUid: string = "";

    @Column()
    @Description("When.")
    public occurredAt: Date = new Date();

    @Column({ type: "simple-json" })
    @Description("The details.")
    public data: Record<string, unknown> = {};

    @Column({ nullable: true })
    @Description("When automations were told.")
    @Nullable
    public dispatchedAt?: Date;

    constructor(other?: Partial<CrmEventSQL>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.type = other.type !== undefined ? other.type : this.type;
            this.contactUid = other.contactUid !== undefined ? other.contactUid : this.contactUid;
            this.occurredAt = other.occurredAt !== undefined ? other.occurredAt : this.occurredAt;
            this.data = other.data !== undefined ? other.data : this.data;
            this.dispatchedAt = "dispatchedAt" in other ? other.dispatchedAt : this.dispatchedAt;
        }
    }
}
