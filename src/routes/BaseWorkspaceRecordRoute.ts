///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { type JWTUser } from "@rapidrest/core";
import { ModelUtils, RepoUtils, RouteDecorators } from "@rapidrest/service-core";
import { CrmModelName } from "../models/CrmModelClasses.js";
import { CrmEntity, WorkspaceAction } from "../models/types.js";
import { notFound } from "../util/WorkspaceAccess.js";
import { badRequest, isObject, readPaging, requireObject } from "../util/Validation.js";
import { CrmRouteBase } from "./CrmRouteBase.js";
const { Delete, Get, Param, Post, Put, Query, User: AuthUser } = RouteDecorators;

/** A record of a workspace. */
export interface WorkspaceRecord extends CrmEntity {
    workspaceUid: string;
}

/** A page of a search: the records, and how many match in all. */
export interface SearchResult<V> {
    items: V[];
    total: number;
}

/** What a write hook gets. */
export interface WriteContext {
    workspaceUid: string;
    user: JWTUser;
}

/**
 * The create, read, update, delete and search endpoints of one kind of workspace record, mounted by a subclass at
 * `/api/mail/crm/<kind>`:
 * - `GET /:workspaceUid` - a page (`limit`, `page`), newest first, optionally narrowed by `listQuery()`'s query parameters.
 * - `POST /:workspaceUid/search` - `{ filter?, q?, sort?, limit?, page? }` to `{ items, total }` (see `searchQuery()`).
 * - `GET /:workspaceUid/:uid`, `POST /:workspaceUid`, `PUT /:workspaceUid/:uid`, `DELETE /:workspaceUid/:uid`.
 *
 * Reading takes `READ` on the workspace, writing `WRITE` (`writeAction` - `MANAGE` for workspace configuration such as property
 * definitions). A subclass supplies the model (`model`), the fields a request may set (`readCreate()`/`readUpdate()`), and optionally
 * the response shape (`toViews()`) and what else a write changes (`afterWrite()`/`afterDelete()`).
 *
 * Every stored record is scoped by `workspaceUid`: a uid of another workspace's record is a 404, the same as one that doesn't exist.
 * An update may carry the `version` it was based on; a stale one is a 409 (`RepoUtils.update()`'s optimistic lock).
 */
export abstract class BaseWorkspaceRecordRoute<T extends WorkspaceRecord, V = T> extends CrmRouteBase {
    /** The model this route serves. */
    protected abstract readonly model: CrmModelName;
    /** The push message type of a change (e.g. `CrmContact`). */
    protected abstract readonly pushType: string;
    /** The action writes take. */
    protected readonly writeAction: WorkspaceAction = WorkspaceAction.WRITE;
    /** The fields a search may sort by. `dateCreated` and `dateModified` are always allowed. */
    protected readonly sortFields: readonly string[] = [];
    /** How many records one workspace may have of this kind (`undefined`: no limit). */
    protected readonly maxRecords?: number;

    /** The stored fields of a new record, from a create request. */
    protected abstract readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<T>>;

    /** The changed fields of `existing`, from an update request. */
    protected abstract readUpdate(body: Record<string, unknown>, existing: T, context: WriteContext): Promise<Partial<T>>;

    /** Whatever a write changes besides the record itself (property values, the timeline...). `before` is unset on a create. */
    protected async afterWrite(_record: T, _before: T | undefined, _body: Record<string, unknown>, _context: WriteContext): Promise<void> {
        // Nothing by default.
    }

    /** Whatever a delete removes besides the record itself. */
    protected async afterDelete(_record: T, _context: WriteContext): Promise<void> {
        // Nothing by default.
    }

    /** The response shape of `records` (all of one workspace). */
    protected async toViews(records: T[], _workspaceUid: string): Promise<V[]> {
        return records.map((record) => JSON.parse(JSON.stringify(record)));
    }

    /** Extra conditions `GET /:workspaceUid` takes from its query parameters (e.g. `subjectUid`). */
    protected listQuery(_query: Record<string, unknown>): Record<string, unknown> {
        return {};
    }

    /**
     * The conditions of a `POST /:workspaceUid/search` request besides the workspace itself, from its `filter` and `q`. By default
     * neither is supported; the contact and company routes compile filters (`filters/Filter.ts`).
     */
    protected async searchQuery(body: Record<string, unknown>, _workspaceUid: string): Promise<Record<string, unknown> | undefined> {
        if (body.filter !== undefined || body.q !== undefined) {
            throw badRequest("This list can't be filtered.");
        }
        return undefined;
    }

    protected async records(): Promise<RepoUtils<T>> {
        return await this.repo<T>(this.model);
    }

    @Get("/:workspaceUid")
    public async list(
        @Param("workspaceUid") workspaceUid: string,
        @Query() query: Record<string, unknown> | undefined,
        @AuthUser user?: JWTUser,
    ): Promise<V[]> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        const paging = readPaging(query?.limit, query?.page);
        const conditions: Record<string, unknown> = this.listQuery(query ?? {});
        const records: T[] = await (await this.records()).find(
            { ...conditions, workspaceUid: ModelUtils.literal(workspaceUid), sort: { dateCreated: "DESC" } },
            { ignoreACL: true, limit: paging.limit, page: paging.page, skipCache: true },
        );
        return await this.toViews(records, workspaceUid);
    }

    @Post("/:workspaceUid/search")
    public async search(@Param("workspaceUid") workspaceUid: string, body: unknown, @AuthUser user?: JWTUser): Promise<SearchResult<V>> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        const request: Record<string, unknown> = body === undefined ? {} : requireObject(body);
        const paging = readPaging(request.limit, request.page);
        const query: Record<string, unknown> = { workspaceUid: ModelUtils.literal(workspaceUid) };
        const conditions: Record<string, unknown> | undefined = await this.searchQuery(request, workspaceUid);
        if (conditions && Object.keys(conditions).length > 0) {
            query.$and = [conditions];
        }
        const repo: RepoUtils<T> = await this.records();
        const total: number = await repo.count(query, { ignoreACL: true, skipCache: true });
        const records: T[] = await repo.find(
            { ...query, sort: this.readSort(request.sort) },
            { ignoreACL: true, limit: paging.limit, page: paging.page, skipCache: true },
        );
        return { items: await this.toViews(records, workspaceUid), total };
    }

    @Get("/:workspaceUid/:uid")
    public async get(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<V> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        return (await this.toViews([await this.requireRecord(workspaceUid, uid)], workspaceUid))[0];
    }

    @Post("/:workspaceUid")
    public async create(@Param("workspaceUid") workspaceUid: string, body: unknown, @AuthUser user?: JWTUser): Promise<V> {
        await this.requireAccess(user, workspaceUid, this.writeAction);
        const request: Record<string, unknown> = requireObject(body);
        const context: WriteContext = { workspaceUid, user: user! };
        const repo: RepoUtils<T> = await this.records();
        if (this.maxRecords !== undefined && (await repo.count({ workspaceUid: ModelUtils.literal(workspaceUid) }, { ignoreACL: true })) >= this.maxRecords) {
            throw badRequest(`A workspace may have at most ${this.maxRecords} of these.`);
        }
        const fields: Partial<T> = await this.readCreate(request, context);
        const modelClass: any = this.classes[this.model];
        const record: T = await repo.create(new modelClass({ ...fields, workspaceUid }), { ignoreACL: true, skipPush: true });
        await this.afterWrite(record, undefined, request, context);
        const view: V = (await this.toViews([record], workspaceUid))[0];
        this.notify(workspaceUid, this.pushType, "create", view);
        return view;
    }

    @Put("/:workspaceUid/:uid")
    public async update(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, body: unknown, @AuthUser user?: JWTUser): Promise<V> {
        await this.requireAccess(user, workspaceUid, this.writeAction);
        const request: Record<string, unknown> = requireObject(body);
        const existing: T = await this.requireRecord(workspaceUid, uid);
        const context: WriteContext = { workspaceUid, user: user! };
        const fields: Partial<T> = await this.readUpdate(request, existing, context);
        const version: number = typeof request.version === "number" ? request.version : existing.version;
        const updated: T = await (await this.records()).update({ ...fields, uid: existing.uid, version }, existing, {
            ignoreACL: true,
            skipPush: true,
        });
        await this.afterWrite(updated, existing, request, context);
        const view: V = (await this.toViews([updated], workspaceUid))[0];
        this.notify(workspaceUid, this.pushType, "update", view);
        return view;
    }

    @Delete("/:workspaceUid/:uid")
    public async remove(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<void> {
        await this.requireAccess(user, workspaceUid, this.writeAction);
        const existing: T = await this.requireRecord(workspaceUid, uid);
        await (await this.records()).delete(existing.uid, { ignoreACL: true, purge: true, skipPush: true });
        await this.afterDelete(existing, { workspaceUid, user: user! });
        this.notify(workspaceUid, this.pushType, "delete", { uid: existing.uid });
    }

    /** The workspace's record `uid`, or a 404. */
    protected async requireRecord(workspaceUid: string, uid: string): Promise<T> {
        const record: T | undefined =
            typeof uid === "string" && uid.length > 0 && uid.length <= 64
                ? await (await this.records()).findOne(uid, { ignoreACL: true, skipCache: true })
                : undefined;
        if (!record || record.workspaceUid !== workspaceUid) {
            throw notFound();
        }
        return record;
    }

    /** `{ field: "ASC" | "DESC" }` from a search's `sort` (`{ field, direction }`), newest first by default. */
    private readSort(raw: unknown): Record<string, "ASC" | "DESC"> {
        if (raw === undefined) {
            return { dateCreated: "DESC" };
        }
        const allowed: string[] = ["dateCreated", "dateModified", ...this.sortFields];
        if (!isObject(raw) || typeof raw.field !== "string" || !allowed.includes(raw.field)) {
            throw badRequest(`'sort' must be { field, direction } with field one of: ${allowed.join(", ")}.`);
        }
        const direction: unknown = raw.direction ?? "asc";
        if (direction !== "asc" && direction !== "desc") {
            throw badRequest("'sort.direction' must be asc or desc.");
        }
        return { [raw.field]: direction === "asc" ? "ASC" : "DESC" };
    }
}
