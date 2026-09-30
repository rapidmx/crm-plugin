///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { MailboxScopedData } from "@rapidmx/restapi";
import { WorkspaceSender } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `WorkspaceSender` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.WorkspaceSenderMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@MailboxScopedData()
@Description("An address a CRM workspace sends mail as, and the mailbox replies to it land in.")
@Index("crm_sender_workspace", ["workspaceUid"])
@Index("crm_sender_mailbox", ["mailboxUid"])
@Protect(
    {
        uid: "CrmWorkspaceSender",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class WorkspaceSenderSQL extends BaseEntity implements WorkspaceSender {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The mailbox replies land in, whose address this is.")
    public mailboxUid: string = "";

    @Column()
    @Description("The From address.")
    public fromAddress: string = "";

    @Column()
    @Description("The From name.")
    public fromName: string = "";

    @Column({ nullable: true })
    @Description("The Reply-To address, if different.")
    @Nullable
    public replyToAddress?: string;

    @Column()
    @Description("The member who added the sender.")
    public createdByUserUid: string = "";

    @Column({ default: false })
    @Description("Whether its mailbox's mail with contacts is logged.")
    public logEmail: boolean = false;

    constructor(other?: Partial<WorkspaceSenderSQL>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.mailboxUid = other.mailboxUid !== undefined ? other.mailboxUid : this.mailboxUid;
            this.fromAddress = other.fromAddress !== undefined ? other.fromAddress : this.fromAddress;
            this.fromName = other.fromName !== undefined ? other.fromName : this.fromName;
            this.replyToAddress = "replyToAddress" in other ? other.replyToAddress : this.replyToAddress;
            this.createdByUserUid = other.createdByUserUid !== undefined ? other.createdByUserUid : this.createdByUserUid;
            this.logEmail = other.logEmail !== undefined ? other.logEmail : this.logEmail;
        }
    }
}
