///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { Pipeline, PipelineStage } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;

/**
 * Implementation of the `Pipeline` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.PipelineMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("A sales pipeline of a CRM workspace.")
@Index("crm_pipeline_workspace", ["workspaceUid"])
@Protect(
    {
        uid: "CrmPipeline",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class PipelineSQL extends BaseEntity implements Pipeline {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The pipeline's name.")
    public name: string = "";

    @Column({ type: "simple-json" })
    @Description("Its stages, in order.")
    public stages: PipelineStage[] = [];

    @Column()
    @Description("Whether it is the workspace's default.")
    public isDefault: boolean = false;

    constructor(other?: Partial<PipelineSQL>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.name = other.name !== undefined ? other.name : this.name;
            this.stages = other.stages !== undefined ? other.stages : this.stages;
            this.isDefault = other.isDefault !== undefined ? other.isDefault : this.isDefault;
        }
    }
}
