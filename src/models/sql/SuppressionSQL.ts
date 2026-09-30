///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { Suppression, SuppressionReason } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `Suppression` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.SuppressionMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("An address a CRM workspace never sends marketing mail to.")
@Index("crm_suppression_workspace_email", ["workspaceUid", "email"], { unique: true })
@Protect(
    {
        uid: "CrmSuppression",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class SuppressionSQL extends BaseEntity implements Suppression {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The address, lowercase.")
    public email: string = "";

    @Column({ type: "varchar" })
    @Description("Why it is suppressed.")
    public reason: SuppressionReason = SuppressionReason.MANUAL;

    @Column({ type: "text", nullable: true })
    @Description("A note on it.")
    @Nullable
    public note?: string;

    constructor(other?: Partial<SuppressionSQL>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.email = other.email !== undefined ? other.email : this.email;
            this.reason = other.reason !== undefined ? other.reason : this.reason;
            this.note = "note" in other ? other.note : this.note;
        }
    }
}
