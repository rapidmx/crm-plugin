///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators, type JWTUser } from "@rapidrest/core";
import { HttpResponse, ModelUtils, RepoUtils, RouteDecorators } from "@rapidrest/service-core";
import { FilterField, FilterNode, compileFilter, filterFields, validateFilter } from "../filters/Filter.js";
import { CrmObjectType, PropertyDefinition, PropertyValue, TimelineKind, WorkspaceAction } from "../models/types.js";
import { csvLine } from "../util/Csv.js";
import {
    PropertyViewValue,
    StoredValue,
    TAGS_KEY,
    deleteValues,
    propertiesView,
    readProperties,
    readValues,
    writeValues,
} from "../util/PropertyValues.js";
import { MAX_TAGS, badRequest, readTags, requireObject } from "../util/Validation.js";
import { BaseWorkspaceRecordRoute, WorkspaceRecord, WriteContext } from "./BaseWorkspaceRecordRoute.js";
import { CrmEventType, recordCrmEvent } from "../automation/Events.js";
const { Config } = ObjectDecorators;
const { Param, Post, Response, User: AuthUser } = RouteDecorators;

/** A contact or company: a workspace record with tags and custom properties. */
export interface TaggedRecord extends WorkspaceRecord {
    tags: string[];
    ownerUserUid?: string;
}

/** A contact or company as the API shows it: the record plus its custom property values. */
export type TaggedRecordView<T> = T & { properties: Record<string, PropertyViewValue> };

/** How many records one bulk request may change. */
export const MAX_BULK = 500;
/** How many records one export may hold, by default (`mail:crm:export:max_rows`). */
export const MAX_EXPORT_ROWS = 50000;

/** The bulk actions (`POST /:workspaceUid/bulk`). */
export type BulkAction = "delete" | "addTags" | "removeTags" | "setOwner";

/**
 * What contacts and companies share on top of `BaseWorkspaceRecordRoute`: tags and custom properties on every write (a request's
 * `tags` and `properties`, stored as `PropertyValue` rows - `util/PropertyValues.ts`), filtered search (`filter` compiled by
 * `filters/Filter.ts`, and `q` for a quick text search), bulk actions, CSV export, and an activity timeline entry for every create
 * and change. Deleting a record deletes its values, notes and timeline, and unlinks the tasks about it.
 */
export abstract class BaseTaggedRecordRoute<T extends TaggedRecord> extends BaseWorkspaceRecordRoute<T, TaggedRecordView<T>> {
    /** The `CrmObjectType` of the records. */
    protected abstract readonly objectType: CrmObjectType;
    /** The record's own filterable fields (`CONTACT_FIELDS`/`COMPANY_FIELDS`). */
    protected abstract readonly recordFields: Readonly<Record<string, FilterField>>;
    /** The fields `q` searches, case-insensitively. */
    protected abstract readonly textFields: readonly string[];
    /** The record's own fields an export lists, in order. */
    protected abstract readonly exportFields: readonly string[];
    /** How a record is named on its timeline and in exports' file names. */
    protected abstract readonly noun: string;

    /** How many records one export may hold. */
    @Config("mail:crm:export:max_rows", MAX_EXPORT_ROWS)
    protected maxExportRows: number = MAX_EXPORT_ROWS;

    /** How many records an export reads at a time. */
    protected exportPageSize: number = 1000;

    /** The record's own fields a CSV column may be imported into, and how its text is read (`number`: as a number). */
    public abstract readonly importFields: Readonly<Record<string, "text" | "number">>;

    /** The workspace's record an imported row is the same as (by email for a contact, by domain or name for a company). */
    protected abstract findExisting(workspaceUid: string, body: Record<string, unknown>): Promise<T | undefined>;

    /**
     * Creates or updates one record from an imported row (`body` in the shape of a create request, as `CrmImportJob` builds it), with
     * the same checks and side effects as the API: a row the same as an existing record updates it when `updateExisting` is set -
     * adding its tags to the record's rather than replacing them - and is skipped otherwise. A bad row throws its 400.
     */
    public async importRow(
        workspaceUid: string,
        userUid: string,
        body: Record<string, unknown>,
        updateExisting: boolean,
    ): Promise<{ outcome: "created" | "updated" | "skipped"; uid: string }> {
        const context: WriteContext = { workspaceUid, user: { uid: userUid } as JWTUser };
        const repo: RepoUtils<T> = await this.records();
        const existing: T | undefined = await this.findExisting(workspaceUid, body);
        if (existing) {
            if (!updateExisting) {
                return { outcome: "skipped", uid: existing.uid };
            }
            const request: Record<string, unknown> = { ...body };
            if (Array.isArray(body.tags)) {
                request.tags = [...new Set([...(existing.tags ?? []), ...(body.tags as string[])])];
            }
            const fields: Partial<T> = await this.readUpdate(request, existing, context);
            const updated: T = await repo.update({ ...fields, uid: existing.uid, version: existing.version }, existing, {
                ignoreACL: true,
                skipPush: true,
            });
            await this.afterWrite(updated, existing, request, context);
            return { outcome: "updated", uid: updated.uid };
        }
        const fields: Partial<T> = await this.readCreate(body, context);
        const modelClass: any = this.classes[this.model];
        const record: T = await repo.create(new modelClass({ ...fields, workspaceUid }), { ignoreACL: true, skipPush: true });
        await this.afterWrite(record, undefined, body, context);
        return { outcome: "created", uid: record.uid };
    }

    /** The workspace's custom property definitions for this record type. */
    protected async definitions(workspaceUid: string): Promise<PropertyDefinition[]> {
        return await (await this.repo<PropertyDefinition>("propertyDefinition")).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), objectType: ModelUtils.literal(this.objectType), sort: { dateCreated: "ASC" } },
            { ignoreACL: true, limit: 1000, skipCache: true },
        );
    }

    protected override async toViews(records: T[], workspaceUid: string): Promise<TaggedRecordView<T>[]> {
        if (records.length === 0) {
            return [];
        }
        const definitions: PropertyDefinition[] = await this.definitions(workspaceUid);
        const values: Map<string, Record<string, PropertyValue[]>> = await readValues(
            await this.repo("propertyValue"),
            records.map((record) => record.uid),
        );
        return records.map((record) => ({ ...JSON.parse(JSON.stringify(record)), properties: propertiesView(values.get(record.uid), definitions) }));
    }

    /** Checks a write's `properties` before the record is written, so a bad value fails the whole request. */
    protected async readPropertyWrites(body: Record<string, unknown>, workspaceUid: string): Promise<Map<string, StoredValue[]>> {
        return readProperties(body.properties, await this.definitions(workspaceUid), this.objectType);
    }

    protected override async afterWrite(record: T, before: T | undefined, body: Record<string, unknown>, context: WriteContext): Promise<void> {
        const valueRepo: RepoUtils<any> = await this.repo("propertyValue");
        const owner = { workspaceUid: context.workspaceUid, objectType: this.objectType, objectUid: record.uid };
        if (!before || body.tags !== undefined) {
            await writeValues(valueRepo, this.classes.propertyValue, owner, TAGS_KEY, record.tags.map((tag) => ({ stringValue: tag })));
        }
        const properties: Map<string, StoredValue[]> = await this.readPropertyWrites(body, context.workspaceUid);
        for (const [key, values] of properties) {
            await writeValues(valueRepo, this.classes.propertyValue, owner, key, values);
        }
        const changed: string[] = before
            ? [
                  ...Object.keys(body).filter(
                      (field) => field !== "version" && field !== "properties" && JSON.stringify((before as any)[field]) !== JSON.stringify((record as any)[field]),
                  ),
                  ...[...properties.keys()].map((key) => `properties.${key}`),
              ]
            : [];
        if (!before || changed.length > 0) {
            await this.addTimeline({
                workspaceUid: context.workspaceUid,
                subjectType: this.objectType,
                subjectUid: record.uid,
                kind: before ? TimelineKind.UPDATED : TimelineKind.CREATED,
                summary: before ? `Updated ${changed.join(", ")}` : `Created the ${this.noun}`,
                // An import or a form submission by nobody in particular has no actor.
                actorUserUid: context.user.uid.toLowerCase() || undefined,
                data: before ? { fields: changed } : {},
            });
            if (this.objectType === CrmObjectType.CONTACT) {
                await recordCrmEvent(
                    this.repos(),
                    this.classes,
                    {
                        workspaceUid: context.workspaceUid,
                        type: before ? CrmEventType.CONTACT_UPDATED : CrmEventType.CONTACT_CREATED,
                        contactUid: record.uid,
                        data: before ? { fields: changed } : {},
                    },
                    this.logger,
                );
            }
        }
    }

    /**
     * Changes `existing` as `PUT /:workspaceUid/:uid` with `body` would, on behalf of `actorUid` (empty for nobody in particular) - for
     * automations, which change records outside any request. Returns the record as saved.
     */
    public async applyUpdate(workspaceUid: string, actorUid: string, existing: T, body: Record<string, unknown>): Promise<T> {
        const context: WriteContext = { workspaceUid, user: { uid: actorUid } as JWTUser };
        const fields: Partial<T> = await this.readUpdate(body, existing, context);
        const updated: T = await (await this.records()).update({ ...fields, uid: existing.uid, version: existing.version }, existing, {
            ignoreACL: true,
            skipPush: true,
        });
        await this.afterWrite(updated, existing, body, context);
        return updated;
    }

    protected override async afterDelete(record: T, context: WriteContext): Promise<void> {
        await this.deleteRelated([record.uid], context.workspaceUid);
    }

    /** Deletes what belongs to the records `uids` - their values, notes and timeline - and unlinks the tasks about them. */
    protected async deleteRelated(uids: string[], workspaceUid: string): Promise<void> {
        await deleteValues(await this.repo("propertyValue"), uids);
        const scope = { workspaceUid: ModelUtils.literal(workspaceUid), subjectUid: ModelUtils.literal(uids, "in") };
        await (await this.repo("note")).truncate(scope, { ignoreACL: true, skipPush: true });
        await (await this.repo("timelineEvent")).truncate(scope, { ignoreACL: true, skipPush: true });
        const taskRepo: RepoUtils<any> = await this.repo("task");
        for (const task of await taskRepo.find(scope, { ignoreACL: true, limit: 1000, skipCache: true })) {
            await taskRepo.update({ uid: task.uid, version: task.version, subjectType: null, subjectUid: null } as any, new this.classes.task(task), {
                ignoreACL: true,
                skipPush: true,
            });
        }
    }

    protected override async searchQuery(body: Record<string, unknown>, workspaceUid: string): Promise<Record<string, unknown> | undefined> {
        const conditions: Record<string, unknown>[] = [];
        if (body.filter !== undefined && body.filter !== null) {
            const fields: Record<string, FilterField> = filterFields(this.recordFields, await this.definitions(workspaceUid), this.objectType);
            const filter: FilterNode = validateFilter(body.filter, fields);
            conditions.push(
                await compileFilter(filter, fields, {
                    workspaceUid,
                    objectType: this.objectType,
                    valueRepo: await this.repo("propertyValue"),
                    recordRepo: await this.records(),
                }),
            );
        }
        if (body.q !== undefined && body.q !== null && body.q !== "") {
            if (typeof body.q !== "string" || body.q.length > 256) {
                throw badRequest("'q' must be text of at most 256 characters.");
            }
            const words: string = body.q.replace(/[*?()]/g, "").trim();
            if (words.length > 0) {
                conditions.push({ $or: this.textFields.map((field) => ({ [field]: `like(*${words}*)` })) });
            }
        }
        return conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : { $and: conditions };
    }

    /**
     * Applies one action to up to `MAX_BULK` records: `delete`, `addTags`/`removeTags` (`tags`), or `setOwner` (`ownerUserUid`, a
     * member, or `null`). Records that aren't the workspace's are skipped. Answers how many were changed.
     */
    @Post("/:workspaceUid/bulk")
    public async bulk(@Param("workspaceUid") workspaceUid: string, body: unknown, @AuthUser user?: JWTUser): Promise<{ changed: number }> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.WRITE);
        const request: Record<string, unknown> = requireObject(body);
        const uids: unknown = request.uids;
        if (!Array.isArray(uids) || uids.length === 0 || uids.length > MAX_BULK || uids.some((uid) => typeof uid !== "string")) {
            throw badRequest(`'uids' must be a list of 1 to ${MAX_BULK} record uids.`);
        }
        const action: unknown = request.action;
        const repo: RepoUtils<T> = await this.records();
        const records: T[] = await repo.find(
            { workspaceUid: ModelUtils.literal(workspaceUid), uid: ModelUtils.literal([...new Set(uids as string[])], "in") },
            { ignoreACL: true, limit: MAX_BULK, skipCache: true },
        );
        const context: WriteContext = { workspaceUid, user: user! };
        const modelClass: any = this.classes[this.model];
        switch (action) {
            case "delete": {
                for (const record of records) {
                    await repo.delete(record.uid, { ignoreACL: true, purge: true, skipPush: true });
                }
                await this.deleteRelated(
                    records.map((record) => record.uid),
                    workspaceUid,
                );
                break;
            }
            case "addTags":
            case "removeTags": {
                const tags: string[] | undefined = readTags(request);
                if (!tags || tags.length === 0) {
                    throw badRequest("'tags' must list at least one tag.");
                }
                for (const record of records) {
                    const current: string[] = record.tags;
                    const next: string[] =
                        action === "addTags" ? [...current, ...tags.filter((tag) => !current.includes(tag))] : current.filter((tag) => !tags.includes(tag));
                    if (next.length > MAX_TAGS) {
                        throw badRequest(`A record may have at most ${MAX_TAGS} tags.`);
                    }
                    if (next.length !== current.length) {
                        await this.writeBulk(repo, modelClass, record, { tags: next } as Partial<T>, context);
                    }
                }
                break;
            }
            case "setOwner": {
                const owner: string | null | undefined = await this.requireMemberUid(
                    workspaceUid,
                    request.ownerUserUid === null ? null : typeof request.ownerUserUid === "string" ? request.ownerUserUid : undefined,
                    "ownerUserUid",
                );
                if (owner === undefined) {
                    throw badRequest("'ownerUserUid' must be a member's user uid, or null.");
                }
                for (const record of records) {
                    await this.writeBulk(repo, modelClass, record, { ownerUserUid: owner } as Partial<T>, context);
                }
                break;
            }
            default:
                throw badRequest("'action' must be one of: delete, addTags, removeTags, setOwner.");
        }
        this.notify(workspaceUid, this.pushType, action === "delete" ? "delete" : "update", { uids: records.map((record) => record.uid) });
        return { changed: records.length };
    }

    /** One record's bulk change, through the same `afterWrite()` a single update runs. */
    private async writeBulk(repo: RepoUtils<T>, modelClass: any, record: T, fields: Partial<T>, context: WriteContext): Promise<void> {
        const before: T = new modelClass(record);
        const updated: T = await repo.update({ ...fields, uid: record.uid, version: record.version }, before, { ignoreACL: true, skipPush: true });
        await this.afterWrite(updated, before, fields, context);
    }

    /**
     * The records matching a search (`filter`, `q`, `sort` - as `POST /:workspaceUid/search`) as a CSV file: the record's own fields,
     * then `tags` (separated by `;`), then one column per custom property. At most `MAX_EXPORT_ROWS` rows.
     */
    @Post("/:workspaceUid/export")
    public async export(
        @Param("workspaceUid") workspaceUid: string,
        body: unknown,
        @Response res: HttpResponse,
        @AuthUser user?: JWTUser,
    ): Promise<HttpResponse> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        const request: Record<string, unknown> = body === undefined ? {} : requireObject(body);
        const query: Record<string, unknown> = { workspaceUid: ModelUtils.literal(workspaceUid), sort: { dateCreated: "ASC" } };
        const conditions: Record<string, unknown> | undefined = await this.searchQuery(request, workspaceUid);
        if (conditions) {
            query.$and = [conditions];
        }
        const definitions: PropertyDefinition[] = await this.definitions(workspaceUid);
        const repo: RepoUtils<T> = await this.records();
        const lines: string[] = [csvLine(["uid", ...this.exportFields, "tags", ...definitions.map((definition) => `properties.${definition.key}`)])];
        // `lines` holds the header too: it has more rows than records.
        for (let page = 0; lines.length - 1 <= this.maxExportRows; page++) {
            const records: T[] = await repo.find(query, { ignoreACL: true, limit: this.exportPageSize, page, skipCache: true });
            for (const view of await this.toViews(records, workspaceUid)) {
                const properties: Record<string, PropertyViewValue> = view.properties;
                lines.push(
                    csvLine([
                        view.uid,
                        ...this.exportFields.map((field) => (view as any)[field]),
                        view.tags.join(";"),
                        ...definitions.map((definition) => {
                            const value: PropertyViewValue | undefined = properties[definition.key];
                            return Array.isArray(value) ? value.join(";") : value;
                        }),
                    ]),
                );
            }
            if (records.length < this.exportPageSize) {
                break;
            }
        }
        if (lines.length - 1 > this.maxExportRows) {
            throw badRequest(`An export may hold at most ${this.maxExportRows} records; narrow it down with a filter.`);
        }
        res.setHeader("content-type", "text/csv; charset=utf-8");
        res.setHeader("content-disposition", `attachment; filename="${this.noun}s.csv"`);
        res.send(`﻿${lines.join("")}`);
        return res;
    }
}
