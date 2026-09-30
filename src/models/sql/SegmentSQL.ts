///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { Segment, SegmentKind } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `Segment` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.SegmentMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("A group of contacts of a CRM workspace, defined by a filter.")
@Index("crm_segment_workspace", ["workspaceUid"])
@Index("crm_segment_refresh", ["kind", "refreshedAt"])
@Protect(
    {
        uid: "CrmSegment",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class SegmentSQL extends BaseEntity implements Segment {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The segment's name.")
    public name: string = "";

    @Column({ type: "text", nullable: true })
    @Description("What the segment is for.")
    @Nullable
    public description?: string;

    @Column({ type: "varchar" })
    @Description("How its members are kept.")
    public kind: SegmentKind = SegmentKind.DYNAMIC;

    @Column({ type: "simple-json" })
    @Description("The contact filter.")
    public filter: unknown = {};

    @Column()
    @Description("How many contacts are in it.")
    public memberCount: number = 0;

    @Column()
    @Description("Whether it was cut off at the size limit.")
    public capped: boolean = false;

    @Column({ nullable: true })
    @Description("When its members were last worked out.")
    @Nullable
    public refreshedAt?: Date;

    @Column()
    @Description("The member who created it.")
    public createdByUserUid: string = "";

    constructor(other?: Partial<SegmentSQL>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.name = other.name !== undefined ? other.name : this.name;
            this.description = "description" in other ? other.description : this.description;
            this.kind = other.kind !== undefined ? other.kind : this.kind;
            this.filter = other.filter !== undefined ? other.filter : this.filter;
            this.memberCount = other.memberCount !== undefined ? other.memberCount : this.memberCount;
            this.capped = other.capped !== undefined ? other.capped : this.capped;
            this.refreshedAt = "refreshedAt" in other ? other.refreshedAt : this.refreshedAt;
            this.createdByUserUid = other.createdByUserUid !== undefined ? other.createdByUserUid : this.createdByUserUid;
        }
    }
}
