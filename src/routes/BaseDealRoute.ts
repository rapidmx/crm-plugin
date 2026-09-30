///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils, RepoUtils, RouteDecorators } from "@rapidrest/service-core";
import type { JWTUser } from "@rapidrest/core";
import { CrmEventType, recordCrmEvent } from "../automation/Events.js";
import {
    CrmCompany,
    CrmContact,
    CrmObjectType,
    Deal,
    DealStageChange,
    DealStatus,
    Pipeline,
    PipelineStage,
    PropertyValue,
    StageKind,
    TimelineKind,
    WorkspaceAction,
} from "../models/types.js";
import { writeValues } from "../util/PropertyValues.js";
import { badRequest, readDate, readNumber, readText } from "../util/Validation.js";
import { BaseWorkspaceRecordRoute, WriteContext } from "./BaseWorkspaceRecordRoute.js";
const { Get, Param, Query, User: AuthUser } = RouteDecorators;

/** How many deals one workspace may have, and contacts one deal. */
export const MAX_DEALS = 50_000;
export const MAX_DEAL_CONTACTS = 20;
/** The `PropertyValue` key a deal's contacts are mirrored under (object type `deal`). */
export const DEAL_CONTACTS_KEY = "contacts";
/** How many moves a deal's history keeps. */
const HISTORY_SIZE = 100;

/** One stage's numbers in a forecast. */
export interface StageForecast {
    stageId: string;
    count: number;
    amount: number;
    /** `amount` times the stage's probability. */
    weighted: number;
}

/** A pipeline's forecast: its open stages' numbers, and what was won and lost in the window. */
export interface Forecast {
    stages: StageForecast[];
    open: { count: number; amount: number; weighted: number };
    won: { count: number; amount: number };
    lost: { count: number; amount: number };
    /** Won out of won and lost, in the window (0 to 1); none without either. */
    winRate?: number;
    /** The mean days from creating a deal to winning it, in the window. */
    averageDaysToWin?: number;
}

/**
 * A workspace's deals (`/api/mail/crm/deals`) - see `BaseWorkspaceRecordRoute` for the endpoints; `GET /:workspaceUid` takes
 * `pipelineUid`, `stageId`, `status`, `ownerUserUid`, `companyUid` and `contactUid` - plus
 * `GET /:workspaceUid/forecast?pipelineUid=&days=` (`Forecast`, over the last `days`, 90 by default).
 *
 * A deal's `status` follows its stage's kind; moving it records the move in `stageHistory`, `closedAt` when it is won or lost, and
 * the move on its timeline and its contacts', and tells automations (`deal.stage_changed`, `deal.won`, `deal.lost`, per contact).
 */
export abstract class BaseDealRoute extends BaseWorkspaceRecordRoute<Deal> {
    protected readonly model = "deal" as const;
    protected readonly pushType: string = "CrmDeal";
    protected override readonly sortFields: readonly string[] = ["name", "amount", "expectedCloseDate", "stageChangedAt"];
    protected override readonly maxRecords: number = MAX_DEALS;

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<Deal>> {
        const pipeline: Pipeline = await this.requirePipeline(context.workspaceUid, body.pipelineUid);
        const stage: PipelineStage = this.requireStage(pipeline, body.stageId ?? pipeline.stages[0].id);
        const now: Date = new Date();
        return {
            name: readText(body, "name", { required: true })!,
            amount: readNumber(body, "amount", { min: 0, max: 1e12 }) ?? 0,
            currency: this.readCurrency(body) ?? "USD",
            pipelineUid: pipeline.uid,
            stageId: stage.id,
            status: statusOf(stage),
            ...(stage.kind !== StageKind.OPEN ? { closedAt: now } : {}),
            stageChangedAt: now,
            stageHistory: [{ stageId: stage.id, at: now, userUid: context.user.uid || undefined }],
            ...(await this.readLinks(body, context.workspaceUid)),
            createdByUserUid: context.user.uid,
        };
    }

    protected async readUpdate(body: Record<string, unknown>, existing: Deal, context: WriteContext): Promise<Partial<Deal>> {
        const fields: Record<string, unknown> = await this.readLinks(body, context.workspaceUid);
        const name: string | null | undefined = readText(body, "name");
        if (name === null) {
            throw badRequest("'name' is required.");
        }
        if (name !== undefined) {
            fields.name = name;
        }
        const amount: number | null | undefined = readNumber(body, "amount", { min: 0, max: 1e12 });
        if (amount !== undefined) {
            fields.amount = amount ?? 0;
        }
        const currency: string | undefined = this.readCurrency(body);
        if (currency) {
            fields.currency = currency;
        }
        if (body.pipelineUid !== undefined || body.stageId !== undefined) {
            const pipeline: Pipeline = await this.requirePipeline(context.workspaceUid, body.pipelineUid ?? existing.pipelineUid);
            const moving: boolean = pipeline.uid !== existing.pipelineUid;
            const stage: PipelineStage = this.requireStage(pipeline, body.stageId ?? (moving ? pipeline.stages[0].id : existing.stageId));
            if (moving || stage.id !== existing.stageId) {
                const now: Date = new Date();
                const change: DealStageChange = { stageId: stage.id, at: now, userUid: context.user.uid || undefined };
                Object.assign(fields, {
                    pipelineUid: pipeline.uid,
                    stageId: stage.id,
                    status: statusOf(stage),
                    stageChangedAt: now,
                    stageHistory: [...(existing.stageHistory ?? []), change].slice(-HISTORY_SIZE),
                    closedAt: stage.kind === StageKind.OPEN ? null : now,
                    ...(stage.kind !== StageKind.LOST ? { lostReason: null } : {}),
                });
            }
        }
        return fields;
    }

    /** The owner, contacts, company, expected close date and lost reason of a request. */
    private async readLinks(body: Record<string, unknown>, workspaceUid: string): Promise<Record<string, unknown>> {
        const fields: Record<string, unknown> = {};
        if (body.ownerUserUid !== undefined) {
            if (body.ownerUserUid !== null && !(await this.findMember(workspaceUid, String(body.ownerUserUid)))) {
                throw badRequest("'ownerUserUid' must be a member of the workspace.");
            }
            fields.ownerUserUid = body.ownerUserUid;
        }
        if (body.contactUids !== undefined) {
            if (!Array.isArray(body.contactUids) || body.contactUids.length > MAX_DEAL_CONTACTS || body.contactUids.some((uid) => typeof uid !== "string")) {
                throw badRequest(`'contactUids' must be a list of at most ${MAX_DEAL_CONTACTS} contact uids.`);
            }
            const uids: string[] = [...new Set(body.contactUids as string[])];
            const found: CrmContact[] =
                uids.length === 0
                    ? []
                    : await (await this.repo<CrmContact>("contact")).find(
                          { workspaceUid: ModelUtils.literal(workspaceUid), uid: ModelUtils.literal(uids, "in") },
                          { ignoreACL: true, limit: uids.length, skipCache: true },
                      );
            if (found.length !== uids.length) {
                throw badRequest("'contactUids' must hold contacts of the workspace.");
            }
            fields.contactUids = uids;
        }
        if (body.companyUid !== undefined) {
            if (body.companyUid !== null) {
                const company: CrmCompany | undefined =
                    typeof body.companyUid === "string" && body.companyUid.length <= 64
                        ? await (await this.repo<CrmCompany>("company")).findOne(body.companyUid, { ignoreACL: true, skipCache: true })
                        : undefined;
                if (company?.workspaceUid !== workspaceUid) {
                    throw badRequest("'companyUid' must be a company of the workspace.");
                }
            }
            fields.companyUid = body.companyUid;
        }
        const expectedCloseDate: Date | null | undefined = readDate(body, "expectedCloseDate");
        if (expectedCloseDate !== undefined) {
            fields.expectedCloseDate = expectedCloseDate;
        }
        if (body.lostReason !== undefined) {
            fields.lostReason = readText(body, "lostReason", { max: 1000 });
        }
        return fields;
    }

    private readCurrency(body: Record<string, unknown>): string | undefined {
        if (body.currency === undefined) {
            return undefined;
        }
        if (typeof body.currency !== "string" || !/^[A-Za-z]{3}$/.test(body.currency)) {
            throw badRequest("'currency' must be a three-letter currency code such as USD.");
        }
        return body.currency.toUpperCase();
    }

    private async requirePipeline(workspaceUid: string, uid: unknown): Promise<Pipeline> {
        const repo: RepoUtils<Pipeline> = await this.repo<Pipeline>("pipeline");
        const pipeline: Pipeline | undefined =
            uid === undefined || uid === null
                ? (await repo.find({ workspaceUid: ModelUtils.literal(workspaceUid), isDefault: ModelUtils.literal(true) }, { ignoreACL: true, limit: 1, skipCache: true }))[0]
                : typeof uid === "string" && uid.length <= 64
                  ? await repo.findOne(uid, { ignoreACL: true, skipCache: true })
                  : undefined;
        if (pipeline?.workspaceUid !== workspaceUid) {
            throw badRequest("'pipelineUid' must be a pipeline of the workspace.");
        }
        return pipeline;
    }

    private requireStage(pipeline: Pipeline, stageId: unknown): PipelineStage {
        const stage: PipelineStage | undefined = pipeline.stages.find((entry) => entry.id === stageId);
        if (!stage) {
            throw badRequest("'stageId' must be a stage of the pipeline.");
        }
        return stage;
    }

    protected override listQuery(query: Record<string, unknown>): Record<string, unknown> {
        const conditions: Record<string, unknown> = {};
        for (const field of ["pipelineUid", "stageId", "status", "ownerUserUid", "companyUid"]) {
            const value: unknown = query[field];
            if (typeof value === "string" && value.length > 0 && value.length <= 64) {
                conditions[field] = ModelUtils.literal(value);
            }
        }
        return conditions;
    }

    /** `GET /:workspaceUid?contactUid=` - the deals of a contact, through the `contacts` values. */
    public override async list(workspaceUid: string, query: Record<string, unknown> | undefined, user?: JWTUser): Promise<Deal[]> {
        const contactUid: unknown = query?.contactUid;
        if (typeof contactUid !== "string" || contactUid.length === 0 || contactUid.length > 64) {
            return await super.list(workspaceUid, query, user);
        }
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        const rows: PropertyValue[] = await (await this.repo<PropertyValue>("propertyValue")).find(
            {
                workspaceUid: ModelUtils.literal(workspaceUid),
                objectType: ModelUtils.literal(CrmObjectType.DEAL),
                key: ModelUtils.literal(DEAL_CONTACTS_KEY),
                stringValue: ModelUtils.literal(contactUid),
            },
            { ignoreACL: true, limit: 500, skipCache: true },
        );
        if (rows.length === 0) {
            return [];
        }
        const deals: Deal[] = await (await this.records()).find(
            { uid: ModelUtils.literal(rows.map((row) => row.objectUid), "in"), sort: { dateCreated: "DESC" } },
            { ignoreACL: true, limit: rows.length, skipCache: true },
        );
        return JSON.parse(JSON.stringify(deals));
    }

    /** Keeps the `contacts` values in step, and records a new deal or a move on the timelines and for automations. */
    protected override async afterWrite(record: Deal, before: Deal | undefined, body: Record<string, unknown>, context: WriteContext): Promise<void> {
        if (!before || body.contactUids !== undefined) {
            await writeValues(
                await this.repo("propertyValue"),
                this.classes.propertyValue,
                { workspaceUid: record.workspaceUid, objectType: CrmObjectType.DEAL, objectUid: record.uid },
                DEAL_CONTACTS_KEY,
                record.contactUids.map((uid) => ({ stringValue: uid })),
            );
        }
        const moved: boolean = !!before && (before.stageId !== record.stageId || before.pipelineUid !== record.pipelineUid);
        if (before && !moved) {
            return;
        }
        const pipeline: Pipeline | undefined = await (await this.repo<Pipeline>("pipeline")).findOne(record.pipelineUid, { ignoreACL: true });
        const stageName: string = pipeline?.stages.find((stage) => stage.id === record.stageId)?.name ?? "a stage";
        const kind: TimelineKind = !before
            ? TimelineKind.DEAL_CREATED
            : record.status === DealStatus.WON
              ? TimelineKind.DEAL_WON
              : record.status === DealStatus.LOST
                ? TimelineKind.DEAL_LOST
                : TimelineKind.DEAL_STAGE_CHANGED;
        const summary: string = !before ? `Created the deal "${record.name}" in ${stageName}` : `Moved the deal "${record.name}" to ${stageName}`;
        const actorUserUid: string | undefined = context.user.uid || undefined;
        for (const subject of [{ subjectType: CrmObjectType.DEAL, subjectUid: record.uid }, ...record.contactUids.map((uid) => ({ subjectType: CrmObjectType.CONTACT, subjectUid: uid }))]) {
            await this.addTimeline({ workspaceUid: record.workspaceUid, ...subject, kind, summary, actorUserUid, data: { dealUid: record.uid, stageId: record.stageId }, refUid: record.uid });
        }
        const eventType: CrmEventType = !before
            ? CrmEventType.DEAL_CREATED
            : record.status === DealStatus.WON
              ? CrmEventType.DEAL_WON
              : record.status === DealStatus.LOST
                ? CrmEventType.DEAL_LOST
                : CrmEventType.DEAL_STAGE_CHANGED;
        for (const contactUid of record.contactUids) {
            await recordCrmEvent(
                this.repos(),
                this.classes,
                {
                    workspaceUid: record.workspaceUid,
                    type: eventType,
                    contactUid,
                    data: { dealUid: record.uid, pipelineUid: record.pipelineUid, stageId: record.stageId, fromStageId: before?.stageId },
                },
                this.logger,
            );
        }
    }

    protected override async afterDelete(record: Deal): Promise<void> {
        await (await this.repo("propertyValue")).truncate(
            { objectType: ModelUtils.literal(CrmObjectType.DEAL), objectUid: ModelUtils.literal(record.uid) },
            { ignoreACL: true },
        );
        const scope = { subjectType: ModelUtils.literal(CrmObjectType.DEAL), subjectUid: ModelUtils.literal(record.uid) };
        for (const name of ["note", "timelineEvent"] as const) {
            await (await this.repo(name)).truncate(scope, { ignoreACL: true, skipPush: true });
        }
        // Its tasks stay, no longer about anything.
        const tasks: RepoUtils<any> = await this.repo("task");
        for (const task of await tasks.find(scope, { ignoreACL: true, limit: 1000, skipCache: true })) {
            await tasks.update({ uid: task.uid, version: task.version, subjectType: null, subjectUid: null } as any, task, { ignoreACL: true, skipPush: true });
        }
    }

    @Get("/:workspaceUid/forecast")
    public async forecast(@Param("workspaceUid") workspaceUid: string, @Query() query: Record<string, unknown> | undefined, @AuthUser user?: JWTUser): Promise<Forecast> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        const pipeline: Pipeline = await this.requirePipeline(workspaceUid, query?.pipelineUid);
        const days: number = Number(query?.days ?? 90);
        if (!Number.isInteger(days) || days < 1 || days > 3650) {
            throw badRequest("'days' must be a whole number from 1 to 3650.");
        }
        const since: Date = new Date(Date.now() - days * 86_400_000);
        const deals: Deal[] = await (await this.records()).find(
            {
                pipelineUid: ModelUtils.literal(pipeline.uid),
                $or: [{ status: ModelUtils.literal(DealStatus.OPEN) }, { closedAt: ModelUtils.literal(since, "gte") }],
            },
            { ignoreACL: true, limit: MAX_DEALS, skipCache: true },
        );
        const stages: StageForecast[] = pipeline.stages
            .filter((stage) => stage.kind === StageKind.OPEN)
            .map((stage) => {
                const here: Deal[] = deals.filter((deal) => deal.stageId === stage.id && deal.status === DealStatus.OPEN);
                const amount: number = here.reduce((sum, deal) => sum + deal.amount, 0);
                return { stageId: stage.id, count: here.length, amount, weighted: (amount * stage.probability) / 100 };
            });
        const total = (status: DealStatus) => {
            const matching: Deal[] = deals.filter((deal) => deal.status === status && status !== DealStatus.OPEN);
            return { count: matching.length, amount: matching.reduce((sum, deal) => sum + deal.amount, 0) };
        };
        const won = total(DealStatus.WON);
        const lost = total(DealStatus.LOST);
        const wonDeals: Deal[] = deals.filter((deal) => deal.status === DealStatus.WON);
        return {
            stages,
            open: {
                count: stages.reduce((sum, stage) => sum + stage.count, 0),
                amount: stages.reduce((sum, stage) => sum + stage.amount, 0),
                weighted: stages.reduce((sum, stage) => sum + stage.weighted, 0),
            },
            won,
            lost,
            ...(won.count + lost.count > 0 ? { winRate: won.count / (won.count + lost.count) } : {}),
            ...(wonDeals.length > 0
                ? {
                      averageDaysToWin:
                          // A deal created already won closes a moment before the datastore stamps its creation.
                          wonDeals.reduce((sum, deal) => sum + Math.max(0, new Date(deal.closedAt!).getTime() - new Date(deal.dateCreated).getTime()) / 86_400_000, 0) /
                          wonDeals.length,
                  }
                : {}),
        };
    }
}

/** A deal's status in `stage`. */
function statusOf(stage: PipelineStage): DealStatus {
    return stage.kind === StageKind.WON ? DealStatus.WON : stage.kind === StageKind.LOST ? DealStatus.LOST : DealStatus.OPEN;
}
