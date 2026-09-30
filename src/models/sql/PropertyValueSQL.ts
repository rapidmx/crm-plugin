///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { CrmObjectType, PropertyValue } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `PropertyValue` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.PropertyValueMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("One custom property value, or one tag, of one CRM record.")
@Index("crm_propval_object_key", ["objectUid", "key"])
@Index("crm_propval_string", ["workspaceUid", "objectType", "key", "stringValue"])
@Index("crm_propval_number", ["workspaceUid", "objectType", "key", "numberValue"])
@Index("crm_propval_date", ["workspaceUid", "objectType", "key", "dateValue"])
@Protect(
    {
        uid: "CrmPropertyValue",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class PropertyValueSQL extends BaseEntity implements PropertyValue {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column({ type: "varchar" })
    @Description("The kind of record the value belongs to.")
    public objectType: CrmObjectType = CrmObjectType.CONTACT;

    @Column()
    @Description("The record the value belongs to.")
    public objectUid: string = "";

    @Column()
    @Description("The property's key, or `tags`.")
    public key: string = "";

    @Column({ nullable: true })
    @Description("A text, select or tag value.")
    @Nullable
    public stringValue?: string;

    @Column({ type: "double precision", nullable: true })
    @Description("A number value, or a boolean one as 1 or 0.")
    @Nullable
    public numberValue?: number;

    @Column({ nullable: true })
    @Description("A date value.")
    @Nullable
    public dateValue?: Date;

    constructor(other?: Partial<PropertyValueSQL>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.objectType = other.objectType !== undefined ? other.objectType : this.objectType;
            this.objectUid = other.objectUid !== undefined ? other.objectUid : this.objectUid;
            this.key = other.key !== undefined ? other.key : this.key;
            this.stringValue = "stringValue" in other ? other.stringValue : this.stringValue;
            this.numberValue = "numberValue" in other ? other.numberValue : this.numberValue;
            this.dateValue = "dateValue" in other ? other.dateValue : this.dateValue;
        }
    }
}
