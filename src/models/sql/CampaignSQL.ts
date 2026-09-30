///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { AbTest, Campaign, CampaignStats, CampaignStatus } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `Campaign` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.CampaignMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("An email campaign of a CRM workspace.")
@Index("crm_campaign_workspace", ["workspaceUid"])
@Index("crm_campaign_status", ["status", "scheduledAt"])
@Protect(
    {
        uid: "CrmCampaign",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class CampaignSQL extends BaseEntity implements Campaign {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The campaign's name.")
    public name: string = "";

    @Column({ type: "varchar" })
    @Description("Where the campaign is.")
    public status: CampaignStatus = CampaignStatus.DRAFT;

    @Column({ nullable: true })
    @Description("The template.")
    @Nullable
    public templateUid?: string;

    @Column({ nullable: true })
    @Description("The sender.")
    @Nullable
    public senderUid?: string;

    @Column({ type: "simple-json" })
    @Description("The lists whose subscribers get it.")
    public listUids: string[] = [];

    @Column({ type: "simple-json" })
    @Description("The lists whose subscribers don't.")
    public excludeListUids: string[] = [];

    @Column()
    @Description("Whether opens are tracked.")
    public trackOpens: boolean = true;

    @Column()
    @Description("Whether clicks are tracked.")
    public trackClicks: boolean = true;

    @Column({ type: "simple-json", nullable: true })
    @Description("The A/B test.")
    @Nullable
    public abTest?: AbTest;

    @Column({ nullable: true })
    @Description("When it goes out.")
    @Nullable
    public scheduledAt?: Date;

    @Column({ nullable: true })
    @Description("When it started going out.")
    @Nullable
    public startedAt?: Date;

    @Column({ nullable: true })
    @Description("When it finished.")
    @Nullable
    public finishedAt?: Date;

    @Column({ nullable: true })
    @Description("How far the audience has been worked out.")
    @Nullable
    public audienceCursor?: string;

    @Column()
    @Description("Whether the audience has been worked out.")
    public audienceDone: boolean = false;

    @Column({ nullable: true })
    @Description("While a replica prepares it.")
    @Nullable
    public leaseExpiresAt?: Date;

    @Column()
    @Description("How many recipients it has.")
    public recipientCount: number = 0;

    @Column({ type: "simple-json" })
    @Description("Its numbers.")
    public stats: CampaignStats = { recipients: 0, sent: 0, failed: 0, suppressed: 0, bounced: 0, opened: 0, clicked: 0, replied: 0, unsubscribed: 0, complained: 0 };

    @Column({ nullable: true })
    @Description("When its numbers were counted.")
    @Nullable
    public statsAt?: Date;

    @Column({ type: "text", nullable: true })
    @Description("Why it failed.")
    @Nullable
    public error?: string;

    @Column()
    @Description("The member who created it.")
    public createdByUserUid: string = "";

    constructor(other?: Partial<CampaignSQL>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.name = other.name !== undefined ? other.name : this.name;
            this.status = other.status !== undefined ? other.status : this.status;
            this.templateUid = "templateUid" in other ? other.templateUid : this.templateUid;
            this.senderUid = "senderUid" in other ? other.senderUid : this.senderUid;
            this.listUids = other.listUids !== undefined ? other.listUids : this.listUids;
            this.excludeListUids = other.excludeListUids !== undefined ? other.excludeListUids : this.excludeListUids;
            this.trackOpens = other.trackOpens !== undefined ? other.trackOpens : this.trackOpens;
            this.trackClicks = other.trackClicks !== undefined ? other.trackClicks : this.trackClicks;
            this.abTest = "abTest" in other ? other.abTest : this.abTest;
            this.scheduledAt = "scheduledAt" in other ? other.scheduledAt : this.scheduledAt;
            this.startedAt = "startedAt" in other ? other.startedAt : this.startedAt;
            this.finishedAt = "finishedAt" in other ? other.finishedAt : this.finishedAt;
            this.audienceCursor = "audienceCursor" in other ? other.audienceCursor : this.audienceCursor;
            this.audienceDone = other.audienceDone !== undefined ? other.audienceDone : this.audienceDone;
            this.leaseExpiresAt = "leaseExpiresAt" in other ? other.leaseExpiresAt : this.leaseExpiresAt;
            this.recipientCount = other.recipientCount !== undefined ? other.recipientCount : this.recipientCount;
            this.stats = other.stats !== undefined ? other.stats : this.stats;
            this.statsAt = "statsAt" in other ? other.statsAt : this.statsAt;
            this.error = "error" in other ? other.error : this.error;
            this.createdByUserUid = other.createdByUserUid !== undefined ? other.createdByUserUid : this.createdByUserUid;
        }
    }
}
