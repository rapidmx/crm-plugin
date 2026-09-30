///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { Pipeline, PipelineStage } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;

/**
 * Implementation of the `Pipeline` interface for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.PipelineSQL` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
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
export class PipelineMongo extends BaseMongoEntity implements Pipeline {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The pipeline's name.")
    public name: string = "";

    @Column()
    @Description("Its stages, in order.")
    public stages: PipelineStage[] = [];

    @Column()
    @Description("Whether it is the workspace's default.")
    public isDefault: boolean = false;

    constructor(other?: Partial<PipelineMongo>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.name = other.name !== undefined ? other.name : this.name;
            this.stages = other.stages !== undefined ? other.stages : this.stages;
            this.isDefault = other.isDefault !== undefined ? other.isDefault : this.isDefault;
        }
    }
}
