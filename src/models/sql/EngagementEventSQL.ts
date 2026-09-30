///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { EngagementEvent, EngagementType, SendSource } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;

/**
 * Implementation of the `EngagementEvent` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.EngagementEventMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("One thing that happened to a CRM outbound message.")
@Index("crm_engagement_source", ["sourceUid", "type"])
@Index("crm_engagement_contact", ["contactUid", "occurredAt"])
@Index("crm_engagement_send", ["sendUid"])
@Index("crm_engagement_workspace", ["workspaceUid"])
@Protect(
    {
        uid: "CrmEngagementEvent",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class EngagementEventSQL extends BaseEntity implements EngagementEvent {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The outbound message.")
    public sendUid: string = "";

    @Column({ type: "varchar" })
    @Description("What it was sent for.")
    public sourceType: SendSource = SendSource.CAMPAIGN;

    @Column()
    @Description("The campaign or automation.")
    public sourceUid: string = "";

    @Column()
    @Description("The contact.")
    public contactUid: string = "";

    @Column()
    @Description("The A/B variant.")
    public variantId: string = "";

    @Column({ type: "varchar" })
    @Description("What happened.")
    public type: EngagementType = EngagementType.SENT;

    @Column()
    @Description("When.")
    public occurredAt: Date = new Date();

    @Column({ type: "simple-json" })
    @Description("The details.")
    public data: Record<string, unknown> = {};

    constructor(other?: Partial<EngagementEventSQL>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.sendUid = other.sendUid !== undefined ? other.sendUid : this.sendUid;
            this.sourceType = other.sourceType !== undefined ? other.sourceType : this.sourceType;
            this.sourceUid = other.sourceUid !== undefined ? other.sourceUid : this.sourceUid;
            this.contactUid = other.contactUid !== undefined ? other.contactUid : this.contactUid;
            this.variantId = other.variantId !== undefined ? other.variantId : this.variantId;
            this.type = other.type !== undefined ? other.type : this.type;
            this.occurredAt = other.occurredAt !== undefined ? other.occurredAt : this.occurredAt;
            this.data = other.data !== undefined ? other.data : this.data;
        }
    }
}
