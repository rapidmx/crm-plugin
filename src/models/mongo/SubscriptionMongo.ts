///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { Subscription, SubscriptionStatus } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `Subscription` interface for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.SubscriptionSQL` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
@Entity()
@Description("A contact's subscription to a CRM mailing list.")
@Index("crm_sub_list_contact", ["listUid", "contactUid"], { unique: true })
@Index("crm_sub_workspace_contact", ["workspaceUid", "contactUid"])
@Index("crm_sub_list_status", ["listUid", "status"])
@Protect(
    {
        uid: "CrmSubscription",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class SubscriptionMongo extends BaseMongoEntity implements Subscription {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The list.")
    public listUid: string = "";

    @Column()
    @Description("The contact.")
    public contactUid: string = "";

    @Column()
    @Description("Whether the contact is subscribed.")
    public status: SubscriptionStatus = SubscriptionStatus.SUBSCRIBED;

    @Column()
    @Description("How the subscription was made.")
    public source: string = "manual";

    @Column({ nullable: true })
    @Description("When consent was given.")
    @Nullable
    public consentAt?: Date;

    @Column({ nullable: true })
    @Description("The address consent was given from.")
    @Nullable
    public consentIp?: string;

    @Column({ nullable: true })
    @Description("When the contact unsubscribed.")
    @Nullable
    public unsubscribedAt?: Date;

    @Column({ nullable: true })
    @Description("When the last confirmation email was sent.")
    @Nullable
    public confirmSentAt?: Date;

    constructor(other?: Partial<SubscriptionMongo>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.listUid = other.listUid !== undefined ? other.listUid : this.listUid;
            this.contactUid = other.contactUid !== undefined ? other.contactUid : this.contactUid;
            this.status = other.status !== undefined ? other.status : this.status;
            this.source = other.source !== undefined ? other.source : this.source;
            this.consentAt = "consentAt" in other ? other.consentAt : this.consentAt;
            this.consentIp = "consentIp" in other ? other.consentIp : this.consentIp;
            this.unsubscribedAt = "unsubscribedAt" in other ? other.unsubscribedAt : this.unsubscribedAt;
            this.confirmSentAt = "confirmSentAt" in other ? other.confirmSentAt : this.confirmSentAt;
        }
    }
}
