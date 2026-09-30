///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { AutomationVersion } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;

/**
 * Implementation of the `AutomationVersion` interface for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.AutomationVersionSQL` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
@Entity()
@Description("A published version of a CRM automation.")
@Index("crm_automationversion_automation", ["automationUid"])
@Index("crm_automationversion_workspace", ["workspaceUid"])
@Protect(
    {
        uid: "CrmAutomationVersion",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class AutomationVersionMongo extends BaseMongoEntity implements AutomationVersion {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The automation.")
    public automationUid: string = "";

    @Column()
    @Description("The version's number.")
    public versionNumber: number = 1;

    @Column()
    @Description("The published graph.")
    public graph: unknown = { nodes: [], edges: [] };

    @Column()
    @Description("The member who published it.")
    public publishedByUserUid: string = "";

    constructor(other?: Partial<AutomationVersionMongo>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.automationUid = other.automationUid !== undefined ? other.automationUid : this.automationUid;
            this.versionNumber = other.versionNumber !== undefined ? other.versionNumber : this.versionNumber;
            this.graph = other.graph !== undefined ? other.graph : this.graph;
            this.publishedByUserUid = other.publishedByUserUid !== undefined ? other.publishedByUserUid : this.publishedByUserUid;
        }
    }
}
