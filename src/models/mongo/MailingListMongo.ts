///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { MailingList } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `MailingList` interface for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.MailingListSQL` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
@Entity()
@Description("A mailing list of a CRM workspace.")
@Index("crm_list_workspace_name", ["workspaceUid", "name"])
@Protect(
    {
        uid: "CrmMailingList",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class MailingListMongo extends BaseMongoEntity implements MailingList {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The list's name.")
    public name: string = "";

    @Column({ nullable: true })
    @Description("What the list is for.")
    @Nullable
    public description?: string;

    @Column()
    @Description("The name subscribers see.")
    public publicName: string = "";

    @Column({ nullable: true })
    @Description("What subscribers are told the list is.")
    @Nullable
    public publicDescription?: string;

    @Column()
    @Description("Whether form subscriptions wait for email confirmation.")
    public doubleOptIn: boolean = false;

    @Column()
    @Description("Whether the preference center offers the list.")
    public visible: boolean = true;

    @Column({ nullable: true })
    @Description("The sender of confirmation emails.")
    @Nullable
    public senderUid?: string;

    constructor(other?: Partial<MailingListMongo>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.name = other.name !== undefined ? other.name : this.name;
            this.description = "description" in other ? other.description : this.description;
            this.publicName = other.publicName !== undefined ? other.publicName : this.publicName;
            this.publicDescription = "publicDescription" in other ? other.publicDescription : this.publicDescription;
            this.doubleOptIn = other.doubleOptIn !== undefined ? other.doubleOptIn : this.doubleOptIn;
            this.visible = other.visible !== undefined ? other.visible : this.visible;
            this.senderUid = "senderUid" in other ? other.senderUid : this.senderUid;
        }
    }
}
