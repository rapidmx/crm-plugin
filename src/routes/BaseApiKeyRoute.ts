///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import * as crypto from "crypto";
import type { JWTUser } from "@rapidrest/core";
import { ApiKey, ApiKeyScope, WorkspaceAction } from "../models/types.js";
import { badRequest, readText } from "../util/Validation.js";
import { BaseWorkspaceRecordRoute, WriteContext } from "./BaseWorkspaceRecordRoute.js";

/** How many API keys one workspace may have. */
export const MAX_API_KEYS = 20;

/** A new API key: `crm_` and 32 random bytes, base64url. */
export function newApiKey(): string {
    return `crm_${crypto.randomBytes(32).toString("base64url")}`;
}

/** What an API key is stored as. */
export function hashApiKey(key: string): string {
    return crypto.createHash("sha256").update(key).digest("hex");
}

/** An API key as the API shows it: never its hash. */
export type ApiKeyView = Omit<ApiKey, "hash">;

/**
 * A workspace's integration API keys (`/api/mail/crm/api-keys`) - see `BaseWorkspaceRecordRoute` for the endpoints; they take
 * `MANAGE`. A key is answered in full once, when it is created (`key`); only its SHA-256 is kept. A key can be renamed and its
 * `scopes` changed; deleting it revokes it. See `BaseIntegrationRoute` for what keys call.
 */
export abstract class BaseApiKeyRoute extends BaseWorkspaceRecordRoute<ApiKey, ApiKeyView> {
    protected readonly model = "apiKey" as const;
    protected readonly pushType: string = "CrmApiKey";
    protected override readonly writeAction: WorkspaceAction = WorkspaceAction.MANAGE;
    protected override readonly maxRecords: number = MAX_API_KEYS;

    /** The key of the create being handled, to answer it once. */
    private issued?: string;

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<ApiKey>> {
        const key: string = newApiKey();
        this.issued = key;
        return {
            name: readText(body, "name", { required: true })!,
            prefix: key.slice(0, 12),
            hash: hashApiKey(key),
            scopes: this.readScopes(body) ?? Object.values(ApiKeyScope),
            createdByUserUid: context.user.uid,
        };
    }

    protected async readUpdate(body: Record<string, unknown>): Promise<Partial<ApiKey>> {
        const fields: Record<string, unknown> = {};
        const name: string | null | undefined = readText(body, "name");
        if (name === null) {
            throw badRequest("'name' is required.");
        }
        if (name !== undefined) {
            fields.name = name;
        }
        const scopes: ApiKeyScope[] | undefined = this.readScopes(body);
        if (scopes) {
            fields.scopes = scopes;
        }
        return fields;
    }

    private readScopes(body: Record<string, unknown>): ApiKeyScope[] | undefined {
        if (body.scopes === undefined) {
            return undefined;
        }
        if (!Array.isArray(body.scopes) || body.scopes.length === 0 || body.scopes.some((scope) => !Object.values(ApiKeyScope).includes(scope as ApiKeyScope))) {
            throw badRequest(`'scopes' must list some of: ${Object.values(ApiKeyScope).join(", ")}.`);
        }
        return [...new Set(body.scopes as ApiKeyScope[])];
    }

    protected override async toViews(records: ApiKey[]): Promise<ApiKeyView[]> {
        return records.map(({ hash: _hash, ...record }) => JSON.parse(JSON.stringify(record)));
    }

    public override async create(workspaceUid: string, body: unknown, user?: JWTUser): Promise<ApiKeyView & { key?: string }> {
        this.issued = undefined;
        const view: ApiKeyView = await super.create(workspaceUid, body, user);
        return { ...view, key: this.issued };
    }
}
