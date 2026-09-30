///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { CrmCompany } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `CrmCompany` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.CrmCompanyMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("An organization a CRM workspace tracks.")
@Index("crm_company_workspace_name", ["workspaceUid", "name"])
@Index("crm_company_workspace_domain", ["workspaceUid", "domain"])
@Protect(
    {
        uid: "CrmCompany",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class CrmCompanySQL extends BaseEntity implements CrmCompany {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The company's name.")
    public name: string = "";

    @Column({ nullable: true })
    @Description("The company's web domain, lowercase.")
    @Nullable
    public domain?: string;

    @Column({ nullable: true })
    @Description("Industry.")
    @Nullable
    public industry?: string;

    @Column({ nullable: true })
    @Description("Number of employees.")
    @Nullable
    public employeeCount?: number;

    @Column({ nullable: true })
    @Description("Phone number.")
    @Nullable
    public phone?: string;

    @Column({ nullable: true })
    @Description("Website.")
    @Nullable
    public website?: string;

    @Column({ nullable: true })
    @Description("City.")
    @Nullable
    public city?: string;

    @Column({ nullable: true })
    @Description("Country.")
    @Nullable
    public country?: string;

    @Column({ nullable: true })
    @Description("The member responsible for the company.")
    @Nullable
    public ownerUserUid?: string;

    @Column({ type: "simple-json" })
    @Description("Lowercase labels.")
    public tags: string[] = [];

    constructor(other?: Partial<CrmCompanySQL>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.name = other.name !== undefined ? other.name : this.name;
            this.domain = "domain" in other ? other.domain : this.domain;
            this.industry = "industry" in other ? other.industry : this.industry;
            this.employeeCount = "employeeCount" in other ? other.employeeCount : this.employeeCount;
            this.phone = "phone" in other ? other.phone : this.phone;
            this.website = "website" in other ? other.website : this.website;
            this.city = "city" in other ? other.city : this.city;
            this.country = "country" in other ? other.country : this.country;
            this.ownerUserUid = "ownerUserUid" in other ? other.ownerUserUid : this.ownerUserUid;
            this.tags = other.tags !== undefined ? other.tags : this.tags;
        }
    }
}
