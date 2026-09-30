///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { CrmNote, CrmObjectType } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;

/**
 * Implementation of the `CrmNote` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.CrmNoteMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("A note written on a CRM contact, company or deal.")
@Index("crm_note_subject", ["workspaceUid", "subjectType", "subjectUid"])
@Protect(
    {
        uid: "CrmNote",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class CrmNoteSQL extends BaseEntity implements CrmNote {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column({ type: "varchar" })
    @Description("The kind of record the note is on.")
    public subjectType: CrmObjectType = CrmObjectType.CONTACT;

    @Column()
    @Description("The record the note is on.")
    public subjectUid: string = "";

    @Column({ type: "text" })
    @Description("The note, as plain text.")
    public body: string = "";

    @Column()
    @Description("Who wrote it.")
    public authorUserUid: string = "";

    @Column()
    @Description("Whether the note is pinned to the top.")
    public pinned: boolean = false;

    constructor(other?: Partial<CrmNoteSQL>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.subjectType = other.subjectType !== undefined ? other.subjectType : this.subjectType;
            this.subjectUid = other.subjectUid !== undefined ? other.subjectUid : this.subjectUid;
            this.body = other.body !== undefined ? other.body : this.body;
            this.authorUserUid = other.authorUserUid !== undefined ? other.authorUserUid : this.authorUserUid;
            this.pinned = other.pinned !== undefined ? other.pinned : this.pinned;
        }
    }
}
