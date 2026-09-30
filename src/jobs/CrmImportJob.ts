///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BackgroundService, ModelUtils, NotificationUtils, ObjectFactory, RepoUtils } from "@rapidrest/service-core";
import type { BlobStore } from "@rapidmx/restapi";
import { CrmModelClasses, CrmRepos } from "../models/CrmModelClasses.js";
import { CrmCompany, CrmImport, CrmObjectType, ImportRowError, ImportStatus, MAX_IMPORT_ERRORS, PropertyDefinition } from "../models/types.js";
import type { BaseTaggedRecordRoute } from "../routes/BaseTaggedRecordRoute.js";
import { detectDelimiter, parseCsv } from "../util/Csv.js";
import { COMPANY_NAME_TARGET, rowToBody } from "../util/ImportMapping.js";
const { Config, Inject, Logger } = ObjectDecorators;

/** How many rows are imported between progress saves (and lease renewals). */
const PROGRESS_EVERY = 100;

/**
 * Imports queued CSV imports (`BaseImportRoute`): each row becomes a create or update through the contact or company route's own
 * `importRow()`, so it gets exactly the checks and side effects an API request would (tags, custom properties, the timeline). A row
 * that fails is counted as skipped with its reason (the first `MAX_IMPORT_ERRORS` are kept) and the import carries on.
 *
 * **One replica per import.** An import is claimed with a version-checked update that sets it `RUNNING` with a lease; progress is saved
 * (and the lease renewed) every `PROGRESS_EVERY` rows the same way, so a replica that loses the row to another stops. An import whose
 * lease ran out - its replica died - is claimed again and resumes after the last saved row; after `max_attempts` claims it fails.
 *
 * Concrete subclasses supply the backend's model classes and route classes.
 */
export abstract class CrmImportJob extends BackgroundService {
    protected abstract classes: CrmModelClasses;
    protected abstract contactRouteClass: any;
    protected abstract companyRouteClass: any;

    // Automatically injected by ObjectFactory on instantiation
    protected _objectFactory?: ObjectFactory;

    @Inject("BlobStore")
    protected blobStore?: BlobStore;

    @Inject(NotificationUtils)
    protected notificationUtils?: NotificationUtils;

    @Config("mail:crm:jobs:import:schedule", "*/5 * * * * *")
    protected scheduleExpr: string = "*/5 * * * * *";

    @Config("mail:crm:jobs:import:lease_seconds", 300)
    protected leaseSeconds: number = 300;

    @Config("mail:crm:jobs:import:max_attempts", 3)
    protected maxAttempts: number = 3;

    @Logger
    protected logger?: any;

    private repos?: CrmRepos;
    private routes: Map<CrmObjectType, BaseTaggedRecordRoute<any>> = new Map();

    public get schedule(): string | undefined {
        return this.scheduleExpr;
    }

    public start(): void {
        // Nothing to prepare: repositories and routes are created on first use.
    }

    public stop(): void {
        // Nothing to release.
    }

    public async run(): Promise<void> {
        const repo: RepoUtils<CrmImport> = await this.repo<CrmImport>("import");
        const now: Date = new Date();
        const due: CrmImport[] = await repo.find(
            {
                $or: [{ status: ModelUtils.literal(ImportStatus.QUEUED) }, { status: ModelUtils.literal(ImportStatus.RUNNING), leaseExpiresAt: ModelUtils.literal(now, "lt") }],
                sort: { dateModified: "ASC" },
            },
            { ignoreACL: true, limit: 10, skipCache: true },
        );
        for (const candidate of due) {
            try {
                const claimed: CrmImport | undefined = await this.claim(new this.classes.import(candidate));
                if (claimed) {
                    await this.process(claimed);
                }
            } catch (err: any) {
                this.logger?.error(`CrmImportJob: import ${candidate.uid} failed: ${err?.message ?? err}`);
            }
        }
    }

    private async repo<T>(name: keyof CrmModelClasses): Promise<RepoUtils<T & any>> {
        this.repos ??= new CrmRepos(this._objectFactory!, this.classes);
        return await this.repos.get<T>(name);
    }

    /** The contact or company route that writes an import's rows. */
    private async route(objectType: CrmObjectType): Promise<BaseTaggedRecordRoute<any>> {
        let route: BaseTaggedRecordRoute<any> | undefined = this.routes.get(objectType);
        if (!route) {
            route = await this._objectFactory!.newInstance(objectType === CrmObjectType.CONTACT ? this.contactRouteClass : this.companyRouteClass, {
                name: "crm-import",
            });
            this.routes.set(objectType, route!);
        }
        return route!;
    }

    /** Takes `candidate` for this replica, or `undefined` when another took it first. An import claimed too often fails instead. */
    private async claim(candidate: CrmImport): Promise<CrmImport | undefined> {
        const repo: RepoUtils<CrmImport> = await this.repo<CrmImport>("import");
        const attempts: number = (candidate.attempts ?? 0) + 1;
        const giveUp: boolean = attempts > this.maxAttempts;
        try {
            const claimed: CrmImport = await repo.update(
                {
                    uid: candidate.uid,
                    version: candidate.version,
                    attempts,
                    status: giveUp ? ImportStatus.FAILED : ImportStatus.RUNNING,
                    leaseExpiresAt: giveUp ? null : new Date(Date.now() + this.leaseSeconds * 1000),
                    ...(giveUp
                        ? { finishedAt: new Date(), errors: [...(candidate.errors ?? []), { row: 0, message: "The import stopped too many times and was given up." }] }
                        : {}),
                } as any,
                candidate,
                { ignoreACL: true, skipPush: true },
            );
            this.publish(claimed);
            return giveUp ? undefined : claimed;
        } catch (err: any) {
            if (/version/i.test(err?.message ?? "")) {
                return undefined;
            }
            throw err;
        }
    }

    /** Imports every row after `processedRows`, saving progress as it goes. */
    private async process(claimed: CrmImport): Promise<void> {
        let current: CrmImport = claimed;
        const raw: Buffer = await this.blobStore!.get(current.blobKey);
        const text: string = raw.toString("utf-8");
        const rows: string[][] = parseCsv(text, detectDelimiter(text)).slice(1);
        const definitions: PropertyDefinition[] = await (await this.repo<PropertyDefinition>("propertyDefinition")).find(
            { workspaceUid: ModelUtils.literal(current.workspaceUid), objectType: ModelUtils.literal(current.objectType) },
            { ignoreACL: true, limit: 1000, skipCache: true },
        );
        const route: BaseTaggedRecordRoute<any> = await this.route(current.objectType);
        const companyColumn: number = current.mapping.findIndex((entry) => entry.target === COMPANY_NAME_TARGET);
        const counts = { createdCount: current.createdCount, updatedCount: current.updatedCount, skippedCount: current.skippedCount };
        const errors: ImportRowError[] = [...(current.errors ?? [])];

        for (let index = current.processedRows; index < rows.length; index++) {
            try {
                const body: Record<string, unknown> = rowToBody(rows[index], current.mapping, route.importFields, definitions, current.tags ?? []);
                if (companyColumn >= 0 && (rows[index][companyColumn] ?? "").trim()) {
                    body.companyUid = await this.companyByName(current, rows[index][companyColumn].trim());
                }
                const outcome = await route.importRow(current.workspaceUid, current.createdByUserUid, body, current.updateExisting);
                counts[outcome === "created" ? "createdCount" : outcome === "updated" ? "updatedCount" : "skippedCount"]++;
            } catch (err: any) {
                counts.skippedCount++;
                if (errors.length < MAX_IMPORT_ERRORS) {
                    // +2: the header is row 1, and `index` counts from 0.
                    errors.push({ row: index + 2, message: String(err?.message ?? err).slice(0, 500) });
                }
            }
            const done: boolean = index === rows.length - 1;
            if (done || (index + 1 - claimed.processedRows) % PROGRESS_EVERY === 0) {
                const saved: CrmImport | undefined = await this.save(current, {
                    ...counts,
                    errors,
                    processedRows: index + 1,
                    ...(done ? { status: ImportStatus.DONE, finishedAt: new Date(), leaseExpiresAt: null } : { leaseExpiresAt: new Date(Date.now() + this.leaseSeconds * 1000) }),
                });
                if (!saved) {
                    this.logger?.warn(`CrmImportJob: lost import ${current.uid} to another replica; stopping.`);
                    return;
                }
                current = saved;
            }
        }
        if (rows.length === 0 || current.processedRows >= rows.length) {
            if (current.status !== ImportStatus.DONE) {
                await this.save(current, { status: ImportStatus.DONE, finishedAt: new Date(), leaseExpiresAt: null });
            }
        }
    }

    /** The workspace's company named `name` (the first found), created when there is none. */
    private async companyByName(current: CrmImport, name: string): Promise<string> {
        const repo: RepoUtils<CrmCompany> = await this.repo<CrmCompany>("company");
        const find = async (): Promise<CrmCompany | undefined> =>
            (await repo.find({ workspaceUid: ModelUtils.literal(current.workspaceUid), name: ModelUtils.literal(name) }, { ignoreACL: true, limit: 1, skipCache: true }))[0];
        let company: CrmCompany | undefined = await find();
        if (!company) {
            await (await this.route(CrmObjectType.COMPANY)).importRow(current.workspaceUid, current.createdByUserUid, { name }, false);
            company = await find();
        }
        return company!.uid;
    }

    /** Saves `fields` onto the import with a version check; `undefined` when another replica changed it first. */
    private async save(current: CrmImport, fields: Record<string, unknown>): Promise<CrmImport | undefined> {
        try {
            const saved: CrmImport = await (await this.repo<CrmImport>("import")).update(
                { ...fields, uid: current.uid, version: current.version } as any,
                new this.classes.import(current),
                { ignoreACL: true, skipPush: true },
            );
            this.publish(saved);
            return saved;
        } catch (err: any) {
            if (/version/i.test(err?.message ?? "")) {
                return undefined;
            }
            throw err;
        }
    }

    private publish(record: CrmImport): void {
        this.notificationUtils?.sendMessage(record.workspaceUid, "CrmImport", "update", JSON.parse(JSON.stringify(record)));
    }
}
