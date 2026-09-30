///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { WebhookEndpoint } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `WebhookEndpoint` interface for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.WebhookEndpointSQL` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
@Entity()
@Description("Where a CRM workspace's events are posted.")
@Index("crm_webhook_workspace", ["workspaceUid", "enabled"])
@Protect(
    {
        uid: "CrmWebhookEndpoint",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class WebhookEndpointMongo extends BaseMongoEntity implements WebhookEndpoint {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The address posted to.")
    public url: string = "";

    @Column()
    @Description("The event types sent.")
    public events: string[] = [];

    @Column()
    @Description("The signing key.")
    public secret: string = "";

    @Column()
    @Description("Whether events are sent.")
    public enabled: boolean = true;

    @Column({ nullable: true })
    @Description("What the endpoint is.")
    @Nullable
    public description?: string;

    @Column()
    @Description("Failed deliveries in a row.")
    public failureCount: number = 0;

    @Column({ nullable: true })
    @Description("When it last received an event.")
    @Nullable
    public lastDeliveryAt?: Date;

    @Column({ nullable: true })
    @Description("The last failure.")
    @Nullable
    public lastError?: string;

    @Column()
    @Description("The member who created it.")
    public createdByUserUid: string = "";

    constructor(other?: Partial<WebhookEndpointMongo>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.url = other.url !== undefined ? other.url : this.url;
            this.events = other.events !== undefined ? other.events : this.events;
            this.secret = other.secret !== undefined ? other.secret : this.secret;
            this.enabled = other.enabled !== undefined ? other.enabled : this.enabled;
            this.description = "description" in other ? other.description : this.description;
            this.failureCount = other.failureCount !== undefined ? other.failureCount : this.failureCount;
            this.lastDeliveryAt = "lastDeliveryAt" in other ? other.lastDeliveryAt : this.lastDeliveryAt;
            this.lastError = "lastError" in other ? other.lastError : this.lastError;
            this.createdByUserUid = other.createdByUserUid !== undefined ? other.createdByUserUid : this.createdByUserUid;
        }
    }
}
