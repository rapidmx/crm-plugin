///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { CrmObjectType, PropertyDefinition, PropertyOption, PropertyType } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `PropertyDefinition` interface for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.PropertyDefinitionSQL` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
@Entity()
@Description("A custom property a CRM workspace defines for contacts, companies or deals.")
@Index("crm_propdef_workspace_type_key", ["workspaceUid", "objectType", "key"], { unique: true })
@Protect(
    {
        uid: "CrmPropertyDefinition",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class PropertyDefinitionMongo extends BaseMongoEntity implements PropertyDefinition {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The kind of record the property belongs to.")
    public objectType: CrmObjectType = CrmObjectType.CONTACT;

    @Column()
    @Description("The property's key.")
    public key: string = "";

    @Column()
    @Description("The property's label.")
    public label: string = "";

    @Column()
    @Description("The type of value the property holds.")
    public type: PropertyType = PropertyType.TEXT;

    @Column()
    @Description("The options of a select or multi-select property.")
    public options: PropertyOption[] = [];

    @Column({ nullable: true })
    @Description("The group the property is shown in.")
    @Nullable
    public group?: string;

    @Column({ nullable: true })
    @Description("What the property is for.")
    @Nullable
    public description?: string;

    constructor(other?: Partial<PropertyDefinitionMongo>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.objectType = other.objectType !== undefined ? other.objectType : this.objectType;
            this.key = other.key !== undefined ? other.key : this.key;
            this.label = other.label !== undefined ? other.label : this.label;
            this.type = other.type !== undefined ? other.type : this.type;
            this.options = other.options !== undefined ? other.options : this.options;
            this.group = "group" in other ? other.group : this.group;
            this.description = "description" in other ? other.description : this.description;
        }
    }
}
