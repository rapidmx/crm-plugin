///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { ScoringActivity, ScoringKind, ScoringRule } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `ScoringRule` interface for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.ScoringRuleSQL` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
@Entity()
@Description("A lead scoring rule of a CRM workspace.")
@Index("crm_scoring_workspace", ["workspaceUid"])
@Protect(
    {
        uid: "CrmScoringRule",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class ScoringRuleMongo extends BaseMongoEntity implements ScoringRule {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The rule's name.")
    public name: string = "";

    @Column()
    @Description("Whether the rule counts.")
    public enabled: boolean = true;

    @Column()
    @Description("What it scores.")
    public kind: ScoringKind = ScoringKind.PROPERTY;

    @Column({ nullable: true })
    @Description("A property rule's contact filter.")
    @Nullable
    public filter?: unknown;

    @Column({ nullable: true })
    @Description("What an activity rule counts.")
    @Nullable
    public activity?: ScoringActivity;

    @Column()
    @Description("Points per match or per time.")
    public points: number = 0;

    @Column({ nullable: true })
    @Description("The most points an activity rule gives.")
    @Nullable
    public maxPoints?: number;

    @Column({ nullable: true })
    @Description("How many days back an activity rule counts.")
    @Nullable
    public withinDays?: number;

    constructor(other?: Partial<ScoringRuleMongo>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.name = other.name !== undefined ? other.name : this.name;
            this.enabled = other.enabled !== undefined ? other.enabled : this.enabled;
            this.kind = other.kind !== undefined ? other.kind : this.kind;
            this.filter = "filter" in other ? other.filter : this.filter;
            this.activity = "activity" in other ? other.activity : this.activity;
            this.points = other.points !== undefined ? other.points : this.points;
            this.maxPoints = "maxPoints" in other ? other.maxPoints : this.maxPoints;
            this.withinDays = "withinDays" in other ? other.withinDays : this.withinDays;
        }
    }
}
