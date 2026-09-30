///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { WebhookDelivery, WebhookDeliveryStatus } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `WebhookDelivery` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.WebhookDeliveryMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("One event to post to one CRM webhook endpoint.")
@Index("crm_webhookdelivery_due", ["status", "nextAttemptAt"])
@Index("crm_webhookdelivery_endpoint", ["endpointUid"])
@Index("crm_webhookdelivery_workspace", ["workspaceUid"])
@Protect(
    {
        uid: "CrmWebhookDelivery",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class WebhookDeliverySQL extends BaseEntity implements WebhookDelivery {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The endpoint.")
    public endpointUid: string = "";

    @Column()
    @Description("The event type.")
    public eventType: string = "";

    @Column({ type: "simple-json" })
    @Description("The JSON body.")
    public payload: Record<string, unknown> = {};

    @Column({ type: "varchar" })
    @Description("Where it is.")
    public status: WebhookDeliveryStatus = WebhookDeliveryStatus.PENDING;

    @Column()
    @Description("How often it was tried.")
    public attempts: number = 0;

    @Column()
    @Description("When it is tried next.")
    public nextAttemptAt: Date = new Date();

    @Column({ nullable: true })
    @Description("While a replica sends it.")
    @Nullable
    public leaseExpiresAt?: Date;

    @Column({ nullable: true })
    @Description("The last HTTP status.")
    @Nullable
    public responseStatus?: number;

    @Column({ type: "text", nullable: true })
    @Description("The last failure.")
    @Nullable
    public lastError?: string;

    @Column({ nullable: true })
    @Description("When it was delivered.")
    @Nullable
    public deliveredAt?: Date;

    constructor(other?: Partial<WebhookDeliverySQL>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.endpointUid = other.endpointUid !== undefined ? other.endpointUid : this.endpointUid;
            this.eventType = other.eventType !== undefined ? other.eventType : this.eventType;
            this.payload = other.payload !== undefined ? other.payload : this.payload;
            this.status = other.status !== undefined ? other.status : this.status;
            this.attempts = other.attempts !== undefined ? other.attempts : this.attempts;
            this.nextAttemptAt = other.nextAttemptAt !== undefined ? other.nextAttemptAt : this.nextAttemptAt;
            this.leaseExpiresAt = "leaseExpiresAt" in other ? other.leaseExpiresAt : this.leaseExpiresAt;
            this.responseStatus = "responseStatus" in other ? other.responseStatus : this.responseStatus;
            this.lastError = "lastError" in other ? other.lastError : this.lastError;
            this.deliveredAt = "deliveredAt" in other ? other.deliveredAt : this.deliveredAt;
        }
    }
}
