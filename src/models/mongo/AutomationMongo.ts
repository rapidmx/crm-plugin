///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { Automation, AutomationReentry, AutomationStatus } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `Automation` interface for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.AutomationSQL` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
@Entity()
@Description("A workflow of a CRM workspace.")
@Index("crm_automation_workspace", ["workspaceUid", "status"])
@Protect(
    {
        uid: "CrmAutomation",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class AutomationMongo extends BaseMongoEntity implements Automation {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The automation's name.")
    public name: string = "";

    @Column({ nullable: true })
    @Description("What the automation does.")
    @Nullable
    public description?: string;

    @Column()
    @Description("Where the automation is.")
    public status: AutomationStatus = AutomationStatus.DRAFT;

    @Column()
    @Description("The draft graph.")
    public graph: unknown = { nodes: [], edges: [] };

    @Column()
    @Description("When a contact may enter again.")
    public reentry: AutomationReentry = AutomationReentry.NEVER;

    @Column({ nullable: true })
    @Description("The goal: a contact filter.")
    @Nullable
    public goalFilter?: unknown;

    @Column({ nullable: true })
    @Description("The published version.")
    @Nullable
    public publishedVersionUid?: string;

    @Column({ nullable: true })
    @Description("When it was last published.")
    @Nullable
    public publishedAt?: Date;

    @Column()
    @Description("The member who created it.")
    public createdByUserUid: string = "";

    @Column({ nullable: true })
    @Description("The workspace-local day (YYYY-MM-DD) its date trigger last put contacts in.")
    @Nullable
    public dateCheckedOn?: string;

    constructor(other?: Partial<AutomationMongo>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.name = other.name !== undefined ? other.name : this.name;
            this.description = "description" in other ? other.description : this.description;
            this.status = other.status !== undefined ? other.status : this.status;
            this.graph = other.graph !== undefined ? other.graph : this.graph;
            this.reentry = other.reentry !== undefined ? other.reentry : this.reentry;
            this.goalFilter = "goalFilter" in other ? other.goalFilter : this.goalFilter;
            this.publishedVersionUid = "publishedVersionUid" in other ? other.publishedVersionUid : this.publishedVersionUid;
            this.publishedAt = "publishedAt" in other ? other.publishedAt : this.publishedAt;
            this.createdByUserUid = other.createdByUserUid !== undefined ? other.createdByUserUid : this.createdByUserUid;
            this.dateCheckedOn = "dateCheckedOn" in other ? other.dateCheckedOn : this.dateCheckedOn;
        }
    }
}
