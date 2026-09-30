///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { SavedBlock } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;

/**
 * Implementation of the `SavedBlock` interface for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.SavedBlockSQL` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
@Entity()
@Description("Blocks saved for reuse in a CRM workspace's templates.")
@Index("crm_savedblock_workspace", ["workspaceUid"])
@Protect(
    {
        uid: "CrmSavedBlock",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class SavedBlockMongo extends BaseMongoEntity implements SavedBlock {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The saved blocks' name.")
    public name: string = "";

    @Column()
    @Description("The saved blocks.")
    public blocks: unknown[] = [];

    constructor(other?: Partial<SavedBlockMongo>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.name = other.name !== undefined ? other.name : this.name;
            this.blocks = other.blocks !== undefined ? other.blocks : this.blocks;
        }
    }
}
