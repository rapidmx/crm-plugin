///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { CrmForm, FormField } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `CrmForm` interface for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.CrmFormSQL` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
@Entity()
@Description("A public signup form of a CRM workspace.")
@Index("crm_form_workspace", ["workspaceUid"])
@Protect(
    {
        uid: "CrmForm",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class CrmFormMongo extends BaseMongoEntity implements CrmForm {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The form's name.")
    public name: string = "";

    @Column()
    @Description("The heading the form shows.")
    public title: string = "";

    @Column({ nullable: true })
    @Description("The text under the heading.")
    @Nullable
    public description?: string;

    @Column()
    @Description("The form's fields.")
    public fields: FormField[] = [];

    @Column()
    @Description("The lists it subscribes to.")
    public listUids: string[] = [];

    @Column()
    @Description("Whether subscriptions wait for email confirmation.")
    public doubleOptIn: boolean = true;

    @Column({ nullable: true })
    @Description("The sender of the confirmation email.")
    @Nullable
    public senderUid?: string;

    @Column()
    @Description("What the form says once submitted.")
    public successMessage: string = "";

    @Column({ nullable: true })
    @Description("Where the browser goes once submitted.")
    @Nullable
    public redirectUrl?: string;

    @Column()
    @Description("Tags added to the contact.")
    public tags: string[] = [];

    @Column()
    @Description("Whether the form takes submissions.")
    public enabled: boolean = true;

    @Column()
    @Description("How many times it was submitted.")
    public submissionCount: number = 0;

    constructor(other?: Partial<CrmFormMongo>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.name = other.name !== undefined ? other.name : this.name;
            this.title = other.title !== undefined ? other.title : this.title;
            this.description = "description" in other ? other.description : this.description;
            this.fields = other.fields !== undefined ? other.fields : this.fields;
            this.listUids = other.listUids !== undefined ? other.listUids : this.listUids;
            this.doubleOptIn = other.doubleOptIn !== undefined ? other.doubleOptIn : this.doubleOptIn;
            this.senderUid = "senderUid" in other ? other.senderUid : this.senderUid;
            this.successMessage = other.successMessage !== undefined ? other.successMessage : this.successMessage;
            this.redirectUrl = "redirectUrl" in other ? other.redirectUrl : this.redirectUrl;
            this.tags = other.tags !== undefined ? other.tags : this.tags;
            this.enabled = other.enabled !== undefined ? other.enabled : this.enabled;
            this.submissionCount = other.submissionCount !== undefined ? other.submissionCount : this.submissionCount;
        }
    }
}
