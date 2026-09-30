///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { CrmImport, CrmObjectType, ImportColumnMapping, ImportRowError, ImportStatus } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `CrmImport` interface for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.CrmImportSQL` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
@Entity()
@Description("A CSV import of CRM contacts or companies.")
@Index("crm_import_workspace", ["workspaceUid"])
@Index("crm_import_status", ["status", "dateModified"])
@Protect(
    {
        uid: "CrmImport",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class CrmImportMongo extends BaseMongoEntity implements CrmImport {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("What the rows are.")
    public objectType: CrmObjectType = CrmObjectType.CONTACT;

    @Column()
    @Description("The uploaded file's name.")
    public fileName: string = "";

    @Column()
    @Description("The uploaded CSV in the BlobStore.")
    public blobKey: string = "";

    @Column()
    @Description("The CSV's header row.")
    public columns: string[] = [];

    @Column()
    @Description("Where each column goes.")
    public mapping: ImportColumnMapping[] = [];

    @Column()
    @Description("Whether a row matching an existing record updates it.")
    public updateExisting: boolean = true;

    @Column()
    @Description("Tags added to every imported record.")
    public tags: string[] = [];

    @Column()
    @Description("Where the import is.")
    public status: ImportStatus = ImportStatus.UPLOADED;

    @Column()
    @Description("How many data rows the CSV has.")
    public totalRows: number = 0;

    @Column()
    @Description("How many rows have been processed.")
    public processedRows: number = 0;

    @Column()
    @Description("How many records were created.")
    public createdCount: number = 0;

    @Column()
    @Description("How many records were updated.")
    public updatedCount: number = 0;

    @Column()
    @Description("How many rows were skipped.")
    public skippedCount: number = 0;

    @Column()
    @Description("The rows that could not be imported.")
    public errors: ImportRowError[] = [];

    @Column()
    @Description("Who started the import.")
    public createdByUserUid: string = "";

    @Column({ nullable: true })
    @Description("Until when the replica working on it owns it.")
    @Nullable
    public leaseExpiresAt?: Date;

    @Column()
    @Description("How many times processing was started.")
    public attempts: number = 0;

    @Column({ nullable: true })
    @Description("When the import finished.")
    @Nullable
    public finishedAt?: Date;

    constructor(other?: Partial<CrmImportMongo>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.objectType = other.objectType !== undefined ? other.objectType : this.objectType;
            this.fileName = other.fileName !== undefined ? other.fileName : this.fileName;
            this.blobKey = other.blobKey !== undefined ? other.blobKey : this.blobKey;
            this.columns = other.columns !== undefined ? other.columns : this.columns;
            this.mapping = other.mapping !== undefined ? other.mapping : this.mapping;
            this.updateExisting = other.updateExisting !== undefined ? other.updateExisting : this.updateExisting;
            this.tags = other.tags !== undefined ? other.tags : this.tags;
            this.status = other.status !== undefined ? other.status : this.status;
            this.totalRows = other.totalRows !== undefined ? other.totalRows : this.totalRows;
            this.processedRows = other.processedRows !== undefined ? other.processedRows : this.processedRows;
            this.createdCount = other.createdCount !== undefined ? other.createdCount : this.createdCount;
            this.updatedCount = other.updatedCount !== undefined ? other.updatedCount : this.updatedCount;
            this.skippedCount = other.skippedCount !== undefined ? other.skippedCount : this.skippedCount;
            this.errors = other.errors !== undefined ? other.errors : this.errors;
            this.createdByUserUid = other.createdByUserUid !== undefined ? other.createdByUserUid : this.createdByUserUid;
            this.leaseExpiresAt = "leaseExpiresAt" in other ? other.leaseExpiresAt : this.leaseExpiresAt;
            this.attempts = other.attempts !== undefined ? other.attempts : this.attempts;
            this.finishedAt = "finishedAt" in other ? other.finishedAt : this.finishedAt;
        }
    }
}
