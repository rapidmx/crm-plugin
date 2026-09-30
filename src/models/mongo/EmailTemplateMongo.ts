///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { EmailTemplate } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `EmailTemplate` interface for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.EmailTemplateSQL` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
@Entity()
@Description("An email template of a CRM workspace.")
@Index("crm_template_workspace_name", ["workspaceUid", "name"])
@Protect(
    {
        uid: "CrmEmailTemplate",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class EmailTemplateMongo extends BaseMongoEntity implements EmailTemplate {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The template's name.")
    public name: string = "";

    @Column({ nullable: true })
    @Description("A grouping of templates.")
    @Nullable
    public category?: string;

    @Column()
    @Description("The subject line.")
    public subject: string = "";

    @Column({ nullable: true })
    @Description("The inbox preview line.")
    @Nullable
    public preheader?: string;

    @Column()
    @Description("The design.")
    public design: unknown = {};

    constructor(other?: Partial<EmailTemplateMongo>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.name = other.name !== undefined ? other.name : this.name;
            this.category = "category" in other ? other.category : this.category;
            this.subject = other.subject !== undefined ? other.subject : this.subject;
            this.preheader = "preheader" in other ? other.preheader : this.preheader;
            this.design = other.design !== undefined ? other.design : this.design;
        }
    }
}
