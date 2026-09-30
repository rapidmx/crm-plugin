///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { Deal, DealStageChange, DealStatus } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `Deal` interface for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.DealSQL` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
@Entity()
@Description("A deal of a CRM workspace.")
@Index("crm_deal_pipeline", ["pipelineUid", "stageId"])
@Index("crm_deal_workspace", ["workspaceUid", "status"])
@Index("crm_deal_company", ["companyUid"])
@Protect(
    {
        uid: "CrmDeal",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class DealMongo extends BaseMongoEntity implements Deal {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The deal's name.")
    public name: string = "";

    @Column()
    @Description("Its value.")
    public amount: number = 0;

    @Column()
    @Description("Its currency.")
    public currency: string = "USD";

    @Column()
    @Description("Its pipeline.")
    public pipelineUid: string = "";

    @Column()
    @Description("Its stage.")
    public stageId: string = "";

    @Column()
    @Description("Open, won or lost.")
    public status: DealStatus = DealStatus.OPEN;

    @Column({ nullable: true })
    @Description("The member responsible.")
    @Nullable
    public ownerUserUid?: string;

    @Column()
    @Description("The people involved.")
    public contactUids: string[] = [];

    @Column({ nullable: true })
    @Description("The company.")
    @Nullable
    public companyUid?: string;

    @Column({ nullable: true })
    @Description("When it should close.")
    @Nullable
    public expectedCloseDate?: Date;

    @Column({ nullable: true })
    @Description("When it was won or lost.")
    @Nullable
    public closedAt?: Date;

    @Column({ nullable: true })
    @Description("Why it was lost.")
    @Nullable
    public lostReason?: string;

    @Column()
    @Description("When it entered its stage.")
    public stageChangedAt: Date = new Date();

    @Column()
    @Description("Its moves between stages.")
    public stageHistory: DealStageChange[] = [];

    @Column()
    @Description("The member who created it.")
    public createdByUserUid: string = "";

    constructor(other?: Partial<DealMongo>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.name = other.name !== undefined ? other.name : this.name;
            this.amount = other.amount !== undefined ? other.amount : this.amount;
            this.currency = other.currency !== undefined ? other.currency : this.currency;
            this.pipelineUid = other.pipelineUid !== undefined ? other.pipelineUid : this.pipelineUid;
            this.stageId = other.stageId !== undefined ? other.stageId : this.stageId;
            this.status = other.status !== undefined ? other.status : this.status;
            this.ownerUserUid = "ownerUserUid" in other ? other.ownerUserUid : this.ownerUserUid;
            this.contactUids = other.contactUids !== undefined ? other.contactUids : this.contactUids;
            this.companyUid = "companyUid" in other ? other.companyUid : this.companyUid;
            this.expectedCloseDate = "expectedCloseDate" in other ? other.expectedCloseDate : this.expectedCloseDate;
            this.closedAt = "closedAt" in other ? other.closedAt : this.closedAt;
            this.lostReason = "lostReason" in other ? other.lostReason : this.lostReason;
            this.stageChangedAt = other.stageChangedAt !== undefined ? other.stageChangedAt : this.stageChangedAt;
            this.stageHistory = other.stageHistory !== undefined ? other.stageHistory : this.stageHistory;
            this.createdByUserUid = other.createdByUserUid !== undefined ? other.createdByUserUid : this.createdByUserUid;
        }
    }
}
