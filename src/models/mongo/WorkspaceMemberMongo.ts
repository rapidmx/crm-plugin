///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { WorkspaceMember, WorkspaceRole } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `WorkspaceMember` interface for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.WorkspaceMemberSQL` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
@Entity()
@Description("A user's membership of a CRM workspace.")
@Index("crm_member_workspace_user", ["workspaceUid", "userUid"], { unique: true })
@Index("crm_member_user", ["userUid"])
@Protect(
    {
        uid: "CrmWorkspaceMember",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class WorkspaceMemberMongo extends BaseMongoEntity implements WorkspaceMember {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The member's user uid.")
    public userUid: string = "";

    @Column()
    @Description("What the member may do.")
    public role: WorkspaceRole = WorkspaceRole.VIEWER;

    @Column({ nullable: true })
    @Description("An address of the member, for showing who they are.")
    @Nullable
    public address?: string;

    @Column({ nullable: true })
    @Description("The member's name, for showing who they are.")
    @Nullable
    public displayName?: string;

    @Column({ nullable: true })
    @Description("The member who added them.")
    @Nullable
    public addedByUserUid?: string;

    constructor(other?: Partial<WorkspaceMemberMongo>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.userUid = other.userUid !== undefined ? other.userUid : this.userUid;
            this.role = other.role !== undefined ? other.role : this.role;
            this.address = "address" in other ? other.address : this.address;
            this.displayName = "displayName" in other ? other.displayName : this.displayName;
            this.addedByUserUid = "addedByUserUid" in other ? other.addedByUserUid : this.addedByUserUid;
        }
    }
}
