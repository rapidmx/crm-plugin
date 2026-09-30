///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { OutboundSend, SendSource, SendStatus } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `OutboundSend` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.OutboundSendMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("One marketing message to one CRM contact.")
@Index("crm_send_dedupe", ["dedupeKey"], { unique: true })
@Index("crm_send_token", ["token"], { unique: true })
@Index("crm_send_source", ["sourceUid", "status"])
@Index("crm_send_due", ["status", "nextAttemptAt"])
@Index("crm_send_message", ["messageId"])
@Index("crm_send_contact", ["contactUid"])
@Index("crm_send_workspace", ["workspaceUid"])
@Protect(
    {
        uid: "CrmOutboundSend",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class OutboundSendSQL extends BaseEntity implements OutboundSend {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column({ type: "varchar" })
    @Description("What it was sent for.")
    public sourceType: SendSource = SendSource.CAMPAIGN;

    @Column()
    @Description("The campaign or automation.")
    public sourceUid: string = "";

    @Column()
    @Description("What makes it unique.")
    public dedupeKey: string = "";

    @Column()
    @Description("The contact.")
    public contactUid: string = "";

    @Column()
    @Description("The address.")
    public email: string = "";

    @Column()
    @Description("The A/B variant.")
    public variantId: string = "";

    @Column({ type: "varchar" })
    @Description("Where it is.")
    public status: SendStatus = SendStatus.QUEUED;

    @Column()
    @Description("Its random token.")
    public token: string = "";

    @Column({ nullable: true })
    @Description("Its Message-ID.")
    @Nullable
    public messageId?: string;

    @Column()
    @Description("How often it was tried.")
    public attempts: number = 0;

    @Column()
    @Description("When it may be tried next.")
    public nextAttemptAt: Date = new Date();

    @Column({ nullable: true })
    @Description("While a replica sends it.")
    @Nullable
    public leaseExpiresAt?: Date;

    @Column({ nullable: true })
    @Description("When it was sent.")
    @Nullable
    public sentAt?: Date;

    @Column({ type: "text", nullable: true })
    @Description("Why it failed.")
    @Nullable
    public error?: string;

    @Column({ nullable: true })
    @Description("When it was first opened.")
    @Nullable
    public firstOpenedAt?: Date;

    @Column({ nullable: true })
    @Description("When it was last opened.")
    @Nullable
    public lastOpenedAt?: Date;

    @Column()
    @Description("How often it was opened.")
    public openCount: number = 0;

    @Column()
    @Description("Whether every open looked automatic.")
    public machineOpen: boolean = false;

    @Column({ nullable: true })
    @Description("When a link was first clicked.")
    @Nullable
    public firstClickedAt?: Date;

    @Column()
    @Description("How often links were clicked.")
    public clickCount: number = 0;

    @Column({ nullable: true })
    @Description("When it was replied to.")
    @Nullable
    public repliedAt?: Date;

    @Column({ nullable: true })
    @Description("When it bounced.")
    @Nullable
    public bouncedAt?: Date;

    @Column({ nullable: true })
    @Description("hard or soft.")
    @Nullable
    public bounceType?: string;

    @Column({ nullable: true })
    @Description("When it was reported as spam.")
    @Nullable
    public complainedAt?: Date;

    @Column({ nullable: true })
    @Description("When its unsubscribe link was used.")
    @Nullable
    public unsubscribedAt?: Date;

    constructor(other?: Partial<OutboundSendSQL>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.sourceType = other.sourceType !== undefined ? other.sourceType : this.sourceType;
            this.sourceUid = other.sourceUid !== undefined ? other.sourceUid : this.sourceUid;
            this.dedupeKey = other.dedupeKey !== undefined ? other.dedupeKey : this.dedupeKey;
            this.contactUid = other.contactUid !== undefined ? other.contactUid : this.contactUid;
            this.email = other.email !== undefined ? other.email : this.email;
            this.variantId = other.variantId !== undefined ? other.variantId : this.variantId;
            this.status = other.status !== undefined ? other.status : this.status;
            this.token = other.token !== undefined ? other.token : this.token;
            this.messageId = "messageId" in other ? other.messageId : this.messageId;
            this.attempts = other.attempts !== undefined ? other.attempts : this.attempts;
            this.nextAttemptAt = other.nextAttemptAt !== undefined ? other.nextAttemptAt : this.nextAttemptAt;
            this.leaseExpiresAt = "leaseExpiresAt" in other ? other.leaseExpiresAt : this.leaseExpiresAt;
            this.sentAt = "sentAt" in other ? other.sentAt : this.sentAt;
            this.error = "error" in other ? other.error : this.error;
            this.firstOpenedAt = "firstOpenedAt" in other ? other.firstOpenedAt : this.firstOpenedAt;
            this.lastOpenedAt = "lastOpenedAt" in other ? other.lastOpenedAt : this.lastOpenedAt;
            this.openCount = other.openCount !== undefined ? other.openCount : this.openCount;
            this.machineOpen = other.machineOpen !== undefined ? other.machineOpen : this.machineOpen;
            this.firstClickedAt = "firstClickedAt" in other ? other.firstClickedAt : this.firstClickedAt;
            this.clickCount = other.clickCount !== undefined ? other.clickCount : this.clickCount;
            this.repliedAt = "repliedAt" in other ? other.repliedAt : this.repliedAt;
            this.bouncedAt = "bouncedAt" in other ? other.bouncedAt : this.bouncedAt;
            this.bounceType = "bounceType" in other ? other.bounceType : this.bounceType;
            this.complainedAt = "complainedAt" in other ? other.complainedAt : this.complainedAt;
            this.unsubscribedAt = "unsubscribedAt" in other ? other.unsubscribedAt : this.unsubscribedAt;
        }
    }
}
