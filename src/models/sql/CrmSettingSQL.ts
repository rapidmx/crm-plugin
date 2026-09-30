///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { CrmSetting } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;

/**
 * Implementation of the `CrmSetting` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.CrmSettingMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("A deployment-wide value the CRM plugin generates and keeps.")
@Index("crm_setting_key", ["key"], { unique: true })
@Protect(
    {
        uid: "CrmSetting",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class CrmSettingSQL extends BaseEntity implements CrmSetting {
    @Column()
    @Description("The setting's name.")
    public key: string = "";

    @Column({ type: "text" })
    @Description("The setting's value.")
    public value: string = "";

    constructor(other?: Partial<CrmSettingSQL>) {
        super(other);

        if (other) {
            this.key = other.key !== undefined ? other.key : this.key;
            this.value = other.value !== undefined ? other.value : this.value;
        }
    }
}
