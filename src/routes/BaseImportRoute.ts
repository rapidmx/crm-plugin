///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import * as crypto from "crypto";
import { ApiError, ObjectDecorators, type JWTUser } from "@rapidrest/core";
import { ApiErrors, HttpRequest, ModelUtils, RepoUtils, RouteDecorators } from "@rapidrest/service-core";
import type { BlobStore } from "@rapidmx/restapi";
import { CrmImport, CrmObjectType, ImportColumnMapping, ImportStatus, PropertyDefinition, WorkspaceAction } from "../models/types.js";
import { CsvError, detectDelimiter, parseCsv } from "../util/Csv.js";
import { IMPORT_FIELDS, importTargets, suggestMapping, validateMapping } from "../util/ImportMapping.js";
import { notFound } from "../util/WorkspaceAccess.js";
import { badRequest, readBoolean, readPaging, readTags, requireObject } from "../util/Validation.js";
import { CrmRouteBase } from "./CrmRouteBase.js";
const { Config, Inject } = ObjectDecorators;
const { Delete, Get, Param, Post, Query, Request, User: AuthUser } = RouteDecorators;

/** How many rows an import may have. */
export const MAX_IMPORT_ROWS = 200000;
/** How many rows of an upload its response previews. */
const PREVIEW_ROWS = 5;

/** The field an import of each type must map a column to. */
const REQUIRED_TARGET: Readonly<Record<string, string>> = { [CrmObjectType.CONTACT]: "email", [CrmObjectType.COMPANY]: "name" };

/** An import as the API shows it on upload: the import, the targets its columns may map to, and its first rows. */
export interface ImportUploadView {
    import: CrmImport;
    targets: string[];
    preview: string[][];
}

/**
 * CSV imports of contacts or companies (`/api/mail/crm/imports`), in two steps. First,
 * `POST /:workspaceUid?objectType=contact&fileName=x.csv` with the file as the raw request body stores it, reads its header, and
 * answers the import with a suggested column mapping, the fields its columns may map to, and a preview of its first rows. Then
 * `POST /:workspaceUid/:uid/start` with `{ mapping, updateExisting?, tags? }` queues it for `CrmImportJob`, which imports it in the
 * background (pushing progress on the workspace's channel as `CrmImport` updates).
 *
 * Plus `GET /:workspaceUid` (newest first), `GET /:workspaceUid/:uid`, and `DELETE /:workspaceUid/:uid` for one that isn't running.
 * Every endpoint takes `WRITE` on the workspace.
 */
export abstract class BaseImportRoute extends CrmRouteBase {
    @Inject("BlobStore")
    protected blobStore?: BlobStore;

    /** The largest CSV accepted, in bytes. */
    @Config("mail:crm:import:max_bytes", 20 * 1024 * 1024)
    protected maxBytes: number = 20 * 1024 * 1024;

    @Get("/:workspaceUid")
    public async list(@Param("workspaceUid") workspaceUid: string, @Query() query: Record<string, unknown> | undefined, @AuthUser user?: JWTUser): Promise<CrmImport[]> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.WRITE);
        const paging = readPaging(query?.limit, query?.page);
        const imports: CrmImport[] = await (await this.repo<CrmImport>("import")).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), sort: { dateCreated: "DESC" } },
            { ignoreACL: true, limit: paging.limit, page: paging.page, skipCache: true },
        );
        return JSON.parse(JSON.stringify(imports));
    }

    @Get("/:workspaceUid/:uid")
    public async get(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<CrmImport> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.WRITE);
        return JSON.parse(JSON.stringify(await this.requireImport(workspaceUid, uid)));
    }

    @Post("/:workspaceUid")
    public async upload(
        @Param("workspaceUid") workspaceUid: string,
        @Query() query: Record<string, unknown> | undefined,
        @Request req: HttpRequest,
        @AuthUser user?: JWTUser,
    ): Promise<ImportUploadView> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.WRITE);
        const objectType: unknown = query?.objectType;
        if (objectType !== CrmObjectType.CONTACT && objectType !== CrmObjectType.COMPANY) {
            throw badRequest("'objectType' must be contact or company.");
        }
        const raw: Buffer | undefined = req.rawBody;
        if (!raw || raw.length === 0) {
            throw badRequest("Send the CSV file as the request body.");
        }
        if (raw.length > this.maxBytes) {
            throw new ApiError(ApiErrors.INVALID_REQUEST, 413, `The file must be at most ${Math.floor(this.maxBytes / (1024 * 1024))} MB.`);
        }
        const text: string = raw.toString("utf-8");
        let rows: string[][];
        try {
            rows = parseCsv(text, detectDelimiter(text), { maxRows: MAX_IMPORT_ROWS + 1 });
        } catch (err) {
            // `parseCsv()` only throws `CsvError`s, whose messages are written for the uploader.
            throw badRequest((err as CsvError).message);
        }
        if (rows.length < 2) {
            throw badRequest("The file needs a header row and at least one row of data.");
        }
        const columns: string[] = rows[0].map((column, index) => column.trim() || `Column ${index + 1}`);
        if (new Set(columns).size !== columns.length) {
            throw badRequest("Every column of the header row needs a different name.");
        }
        const definitions: PropertyDefinition[] = await this.definitions(workspaceUid, objectType);
        const targets: string[] = importTargets(objectType, IMPORT_FIELDS[objectType], definitions);
        const fileName: string =
            typeof query?.fileName === "string" && query.fileName.trim().length > 0 ? query.fileName.trim().slice(0, 256) : "import.csv";

        const blobKey: string = `crm-imports/${crypto.randomUUID()}`;
        await this.blobStore!.put(blobKey, raw, { contentType: "text/csv" });
        const importClass: any = this.classes.import;
        let created: CrmImport;
        try {
            created = await (await this.repo<CrmImport>("import")).create(
                new importClass({
                    workspaceUid,
                    objectType,
                    fileName,
                    blobKey,
                    columns,
                    mapping: suggestMapping(columns, targets, definitions),
                    status: ImportStatus.UPLOADED,
                    totalRows: rows.length - 1,
                    createdByUserUid: user!.uid.toLowerCase(),
                }),
                { ignoreACL: true, skipPush: true },
            );
        } catch (err) {
            await this.deleteBlob(blobKey);
            throw err;
        }
        return { import: JSON.parse(JSON.stringify(created)), targets, preview: rows.slice(1, 1 + PREVIEW_ROWS) };
    }

    @Post("/:workspaceUid/:uid/start")
    public async start(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, body: unknown, @AuthUser user?: JWTUser): Promise<CrmImport> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.WRITE);
        const request: Record<string, unknown> = requireObject(body);
        const existing: CrmImport = await this.requireImport(workspaceUid, uid);
        if (existing.status !== ImportStatus.UPLOADED) {
            throw badRequest("This import has already been started.");
        }
        const definitions: PropertyDefinition[] = await this.definitions(workspaceUid, existing.objectType);
        const targets: string[] = importTargets(existing.objectType, IMPORT_FIELDS[existing.objectType as CrmObjectType.CONTACT | CrmObjectType.COMPANY], definitions);
        const mapping: ImportColumnMapping[] = validateMapping(request.mapping, existing.columns, targets, REQUIRED_TARGET[existing.objectType]);
        const updated: CrmImport = await (await this.repo<CrmImport>("import")).update(
            {
                uid: existing.uid,
                version: existing.version,
                mapping,
                updateExisting: readBoolean(request, "updateExisting") ?? true,
                tags: readTags(request) ?? [],
                status: ImportStatus.QUEUED,
            } as any,
            existing,
            { ignoreACL: true, skipPush: true },
        );
        this.notify(workspaceUid, "CrmImport", "update", JSON.parse(JSON.stringify(updated)));
        return JSON.parse(JSON.stringify(updated));
    }

    @Delete("/:workspaceUid/:uid")
    public async remove(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<void> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.WRITE);
        const existing: CrmImport = await this.requireImport(workspaceUid, uid);
        if (existing.status === ImportStatus.RUNNING) {
            throw badRequest("An import can't be deleted while it runs.");
        }
        await (await this.repo("import")).delete(existing.uid, { ignoreACL: true, purge: true, skipPush: true });
        await this.deleteBlob(existing.blobKey);
    }

    private async definitions(workspaceUid: string, objectType: string): Promise<PropertyDefinition[]> {
        return await (await this.repo<PropertyDefinition>("propertyDefinition")).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), objectType: ModelUtils.literal(objectType) },
            { ignoreACL: true, limit: 1000, skipCache: true },
        );
    }

    private async requireImport(workspaceUid: string, uid: string): Promise<CrmImport> {
        const repo: RepoUtils<CrmImport> = await this.repo<CrmImport>("import");
        const existing: CrmImport | undefined =
            typeof uid === "string" && uid.length > 0 && uid.length <= 64 ? await repo.findOne(uid, { ignoreACL: true, skipCache: true }) : undefined;
        if (!existing || existing.workspaceUid !== workspaceUid) {
            throw notFound();
        }
        return existing;
    }

    /** Deletes an import's file, logging rather than failing when it can't. */
    private async deleteBlob(key: string): Promise<void> {
        try {
            await this.blobStore!.delete(key);
        } catch (err: any) {
            this.logger?.warn(`ImportRoute: could not delete ${key}: ${err?.message ?? err}`);
        }
    }
}
