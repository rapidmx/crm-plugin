///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { Enrollment, EnrollmentState, EnrollmentStep, EnrollmentWait } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `Enrollment` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.EnrollmentMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("One contact's run through a CRM automation.")
@Index("crm_enrollment_due", ["state", "nextRunAt"])
@Index("crm_enrollment_automation", ["automationUid", "state"])
@Index("crm_enrollment_contact", ["contactUid", "state"])
@Index("crm_enrollment_workspace", ["workspaceUid"])
@Protect(
    {
        uid: "CrmEnrollment",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class EnrollmentSQL extends BaseEntity implements Enrollment {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The automation.")
    public automationUid: string = "";

    @Column()
    @Description("The version it goes through.")
    public versionUid: string = "";

    @Column()
    @Description("The contact.")
    public contactUid: string = "";

    @Column({ type: "varchar" })
    @Description("Where it is.")
    public state: EnrollmentState = EnrollmentState.ACTIVE;

    @Column()
    @Description("The node it is at.")
    public currentNodeId: string = "";

    @Column()
    @Description("When it moves on next.")
    public nextRunAt: Date = new Date();

    @Column({ type: "simple-json", nullable: true })
    @Description("What it waits for.")
    @Nullable
    public waitFor?: EnrollmentWait;

    @Column({ nullable: true })
    @Description("While a replica moves it along.")
    @Nullable
    public leaseExpiresAt?: Date;

    @Column()
    @Description("How many steps it took.")
    public steps: number = 0;

    @Column({ type: "simple-json" })
    @Description("Its most recent steps.")
    public history: EnrollmentStep[] = [];

    @Column()
    @Description("When it entered.")
    public enteredAt: Date = new Date();

    @Column({ nullable: true })
    @Description("When it finished.")
    @Nullable
    public finishedAt?: Date;

    @Column({ type: "text", nullable: true })
    @Description("Why it failed.")
    @Nullable
    public error?: string;

    constructor(other?: Partial<EnrollmentSQL>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.automationUid = other.automationUid !== undefined ? other.automationUid : this.automationUid;
            this.versionUid = other.versionUid !== undefined ? other.versionUid : this.versionUid;
            this.contactUid = other.contactUid !== undefined ? other.contactUid : this.contactUid;
            this.state = other.state !== undefined ? other.state : this.state;
            this.currentNodeId = other.currentNodeId !== undefined ? other.currentNodeId : this.currentNodeId;
            this.nextRunAt = other.nextRunAt !== undefined ? other.nextRunAt : this.nextRunAt;
            this.waitFor = "waitFor" in other ? other.waitFor : this.waitFor;
            this.leaseExpiresAt = "leaseExpiresAt" in other ? other.leaseExpiresAt : this.leaseExpiresAt;
            this.steps = other.steps !== undefined ? other.steps : this.steps;
            this.history = other.history !== undefined ? other.history : this.history;
            this.enteredAt = other.enteredAt !== undefined ? other.enteredAt : this.enteredAt;
            this.finishedAt = "finishedAt" in other ? other.finishedAt : this.finishedAt;
            this.error = "error" in other ? other.error : this.error;
        }
    }
}
