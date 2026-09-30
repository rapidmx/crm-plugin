///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { Workspace } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `Workspace` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.WorkspaceMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("A shared CRM space: its own contacts, companies and everything else, used by its members.")
@Protect(
    {
        uid: "CrmWorkspace",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    true,
)
export class WorkspaceSQL extends BaseEntity implements Workspace {
    @Column()
    @Description("The workspace's name.")
    public name: string = "";

    @Column({ type: "text", nullable: true })
    @Description("What the workspace is for.")
    @Nullable
    public description?: string;

    @Column()
    @Description("The IANA time zone dates are shown and scheduled in.")
    public timezone: string = "UTC";

    @Column({ type: "text", nullable: true })
    @Description("The postal address marketing mail must carry.")
    @Nullable
    public postalAddress?: string;

    @Column({ nullable: true })
    @Description("The organization's website.")
    @Nullable
    public website?: string;

    @Column()
    @Description("The user who created the workspace.")
    public createdByUserUid: string = "";

    constructor(other?: Partial<WorkspaceSQL>) {
        super(other);

        if (other) {
            this.name = other.name !== undefined ? other.name : this.name;
            this.description = "description" in other ? other.description : this.description;
            this.timezone = other.timezone !== undefined ? other.timezone : this.timezone;
            this.postalAddress = "postalAddress" in other ? other.postalAddress : this.postalAddress;
            this.website = "website" in other ? other.website : this.website;
            this.createdByUserUid = other.createdByUserUid !== undefined ? other.createdByUserUid : this.createdByUserUid;
        }
    }
}
