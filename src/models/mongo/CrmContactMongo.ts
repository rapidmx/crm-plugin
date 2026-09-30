///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { CrmContact, EmailStatus, LifecycleStage } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `CrmContact` interface for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.CrmContactSQL` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
@Entity()
@Description("A person a CRM workspace tracks.")
@Index("crm_contact_workspace_email", ["workspaceUid", "email"], { unique: true })
@Index("crm_contact_workspace_company", ["workspaceUid", "companyUid"])
@Index("crm_contact_workspace_modified", ["workspaceUid", "dateModified"])
@Protect(
    {
        uid: "CrmContact",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class CrmContactMongo extends BaseMongoEntity implements CrmContact {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The contact's email address, lowercase.")
    public email: string = "";

    @Column({ nullable: true })
    @Description("First name.")
    @Nullable
    public firstName?: string;

    @Column({ nullable: true })
    @Description("Last name.")
    @Nullable
    public lastName?: string;

    @Column({ nullable: true })
    @Description("Phone number.")
    @Nullable
    public phone?: string;

    @Column({ nullable: true })
    @Description("Job title.")
    @Nullable
    public jobTitle?: string;

    @Column({ nullable: true })
    @Description("The contact's company.")
    @Nullable
    public companyUid?: string;

    @Column({ nullable: true })
    @Description("The member responsible for the contact.")
    @Nullable
    public ownerUserUid?: string;

    @Column()
    @Description("Where the contact is in the customer journey.")
    public lifecycleStage: LifecycleStage = LifecycleStage.SUBSCRIBER;

    @Column({ nullable: true })
    @Description("A free-form sales status.")
    @Nullable
    public leadStatus?: string;

    @Column()
    @Description("The lead score.")
    public score: number = 0;

    @Column()
    @Description("Lowercase labels.")
    public tags: string[] = [];

    @Column({ nullable: true })
    @Description("Where the contact came from.")
    @Nullable
    public source?: string;

    @Column()
    @Description("Whether marketing mail may be sent to the contact at all.")
    public emailStatus: EmailStatus = EmailStatus.ACTIVE;

    @Column({ nullable: true })
    @Description("When the contact last opened, clicked or replied to mail from the workspace.")
    @Nullable
    public lastEngagedAt?: Date;

    constructor(other?: Partial<CrmContactMongo>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.email = other.email !== undefined ? other.email : this.email;
            this.firstName = "firstName" in other ? other.firstName : this.firstName;
            this.lastName = "lastName" in other ? other.lastName : this.lastName;
            this.phone = "phone" in other ? other.phone : this.phone;
            this.jobTitle = "jobTitle" in other ? other.jobTitle : this.jobTitle;
            this.companyUid = "companyUid" in other ? other.companyUid : this.companyUid;
            this.ownerUserUid = "ownerUserUid" in other ? other.ownerUserUid : this.ownerUserUid;
            this.lifecycleStage = other.lifecycleStage !== undefined ? other.lifecycleStage : this.lifecycleStage;
            this.leadStatus = "leadStatus" in other ? other.leadStatus : this.leadStatus;
            this.score = other.score !== undefined ? other.score : this.score;
            this.tags = other.tags !== undefined ? other.tags : this.tags;
            this.source = "source" in other ? other.source : this.source;
            this.emailStatus = other.emailStatus !== undefined ? other.emailStatus : this.emailStatus;
            this.lastEngagedAt = "lastEngagedAt" in other ? other.lastEngagedAt : this.lastEngagedAt;
        }
    }
}
