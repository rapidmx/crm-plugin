///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { ApiKey, ApiKeyScope } from "../types.js";
const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Column, Entity, Index } = PersistenceDecorators;
const { Nullable } = ObjectDecorators;

/**
 * Implementation of the `ApiKey` interface for storage in a SQL database. If MongoDB is desired, please use
 * `models.mongo.ApiKeyMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("A CRM workspace's integration API key.")
@Index("crm_apikey_hash", ["hash"], { unique: true })
@Index("crm_apikey_workspace", ["workspaceUid"])
@Protect(
    {
        uid: "CrmApiKey",
        records: [
            { userOrRoleId: "anonymous", actions: [] },
            { userOrRoleId: ".*", actions: [] },
        ],
    },
    false,
)
export class ApiKeySQL extends BaseEntity implements ApiKey {
    @Column()
    @Description("The workspace.")
    public workspaceUid: string = "";

    @Column()
    @Description("The key's name.")
    public name: string = "";

    @Column()
    @Description("The key's first characters.")
    public prefix: string = "";

    @Column()
    @Description("The key's SHA-256.")
    public hash: string = "";

    @Column({ type: "simple-json" })
    @Description("What it may do.")
    public scopes: ApiKeyScope[] = [];

    @Column({ nullable: true })
    @Description("When it was last used.")
    @Nullable
    public lastUsedAt?: Date;

    @Column({ nullable: true })
    @Description("When it was revoked.")
    @Nullable
    public revokedAt?: Date;

    @Column()
    @Description("The member who created it.")
    public createdByUserUid: string = "";

    constructor(other?: Partial<ApiKeySQL>) {
        super(other);

        if (other) {
            this.workspaceUid = other.workspaceUid !== undefined ? other.workspaceUid : this.workspaceUid;
            this.name = other.name !== undefined ? other.name : this.name;
            this.prefix = other.prefix !== undefined ? other.prefix : this.prefix;
            this.hash = other.hash !== undefined ? other.hash : this.hash;
            this.scopes = other.scopes !== undefined ? other.scopes : this.scopes;
            this.lastUsedAt = "lastUsedAt" in other ? other.lastUsedAt : this.lastUsedAt;
            this.revokedAt = "revokedAt" in other ? other.revokedAt : this.revokedAt;
            this.createdByUserUid = other.createdByUserUid !== undefined ? other.createdByUserUid : this.createdByUserUid;
        }
    }
}
