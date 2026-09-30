///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils, RepoUtils, RouteDecorators } from "@rapidrest/service-core";
import type { JWTUser } from "@rapidrest/core";
import {
    AbMetric,
    AbTest,
    Campaign,
    CampaignStats,
    CampaignStatus,
    CampaignVariant,
    EmailTemplate,
    EngagementEvent,
    OutboundSend,
    SendStatus,
    WorkspaceAction,
    WorkspaceSender,
} from "../models/types.js";
import { countAudience } from "../sending/Audience.js";
import { LinkClicks, campaignStats, emptyCounts, linkClicks } from "../sending/Stats.js";
import { TemplateDesign, hasUnsubscribeLink } from "../templates/Design.js";
import { checkMergeTags, compileDesign } from "../templates/Render.js";
import { badRequest, isObject, readBoolean, readDate, readEnum, readNumber, readPaging, readText, requireObject } from "../util/Validation.js";
import { BaseWorkspaceRecordRoute, SearchResult, WriteContext } from "./BaseWorkspaceRecordRoute.js";
const { Get, Param, Post, User: AuthUser } = RouteDecorators;

/** How many campaigns one workspace may have. */
export const MAX_CAMPAIGNS = 5000;
/** How many lists a campaign may go to, or exclude. */
export const MAX_CAMPAIGN_LISTS = 20;
/** The A/B variant ids, in order. */
export const VARIANT_IDS: readonly string[] = ["A", "B", "C", "D"];

/** Where a campaign can be changed, and deleted. */
const EDITABLE: ReadonlySet<CampaignStatus> = new Set([CampaignStatus.DRAFT]);
const RUNNING: ReadonlySet<CampaignStatus> = new Set([CampaignStatus.PREPARING, CampaignStatus.SENDING, CampaignStatus.PAUSED]);

/** One thing standing in the way of sending a campaign. */
export interface CampaignProblem {
    field: string;
    message: string;
}

/** What the engagement filter of `POST /:uid/recipients` can ask for: the sends where that happened. */
const ENGAGEMENTS: Record<string, string> = {
    opened: "firstOpenedAt",
    clicked: "firstClickedAt",
    replied: "repliedAt",
    bounced: "bouncedAt",
    unsubscribed: "unsubscribedAt",
    complained: "complainedAt",
};

/**
 * A workspace's email campaigns (`/api/mail/crm/campaigns`) - see `BaseWorkspaceRecordRoute` for the endpoints - plus:
 * - `GET /:workspaceUid/:uid/checklist` - what stands in the way of sending it (`CampaignProblem[]`, empty when nothing).
 * - `POST /:workspaceUid/:uid/schedule` - `{ sendAt? }`: sends it at `sendAt`, or now. Refused while the checklist has problems.
 * - `POST /:workspaceUid/:uid/unschedule` - back to a draft, before it starts.
 * - `POST /:workspaceUid/:uid/pause`, `.../resume`, `.../cancel` - while it goes out. Cancelling drops what hasn't been sent.
 * - `POST /:workspaceUid/:uid/duplicate` - a draft copy.
 * - `POST /:workspaceUid/audience` - `{ listUids, excludeListUids? }` to `{ count, capped }`: how many contacts it would reach now.
 * - `GET /:workspaceUid/:uid/report` - fresh stats and the links by clicks.
 * - `POST /:workspaceUid/:uid/recipients` - `{ status?, engagement?, q?, limit?, page? }` to a page of its messages.
 *
 * Only a draft can be changed; the jobs (`CampaignJob`, `SendDispatchJob`) take it from `scheduled` on.
 */
export abstract class BaseCampaignRoute extends BaseWorkspaceRecordRoute<Campaign> {
    protected readonly model = "campaign" as const;
    protected readonly pushType: string = "CrmCampaign";
    protected override readonly sortFields: readonly string[] = ["name", "scheduledAt", "finishedAt"];
    protected override readonly maxRecords: number = MAX_CAMPAIGNS;

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<Campaign>> {
        return {
            status: CampaignStatus.DRAFT,
            listUids: [],
            excludeListUids: [],
            trackOpens: true,
            trackClicks: true,
            audienceDone: false,
            recipientCount: 0,
            stats: emptyCounts(),
            ...(await this.readFields(body, context.workspaceUid, true)),
            createdByUserUid: context.user.uid,
        };
    }

    protected async readUpdate(body: Record<string, unknown>, existing: Campaign, context: WriteContext): Promise<Partial<Campaign>> {
        if (!EDITABLE.has(existing.status)) {
            throw badRequest("Only a draft campaign can be changed.");
        }
        return await this.readFields(body, context.workspaceUid, false);
    }

    private async readFields(body: Record<string, unknown>, workspaceUid: string, creating: boolean): Promise<Partial<Campaign>> {
        const fields: Record<string, unknown> = {};
        const name: string | null | undefined = readText(body, "name", { required: creating });
        if (name === null) {
            throw badRequest("'name' is required.");
        }
        if (name !== undefined) {
            fields.name = name;
        }
        if (body.templateUid !== undefined) {
            fields.templateUid = body.templateUid === null ? null : (await this.requireTemplate(workspaceUid, body.templateUid, "templateUid")).uid;
        }
        if (body.senderUid !== undefined) {
            fields.senderUid = body.senderUid === null ? null : await this.requireSender(workspaceUid, body.senderUid);
        }
        for (const field of ["listUids", "excludeListUids"] as const) {
            if (body[field] !== undefined) {
                fields[field] = await this.readLists(workspaceUid, body[field], field);
            }
        }
        for (const field of ["trackOpens", "trackClicks"] as const) {
            const value: boolean | undefined = readBoolean(body, field);
            if (value !== undefined) {
                fields[field] = value;
            }
        }
        if (body.abTest !== undefined) {
            fields.abTest = body.abTest === null ? null : await this.readAbTest(workspaceUid, body.abTest);
        }
        return fields;
    }

    private async readLists(workspaceUid: string, raw: unknown, field: string): Promise<string[]> {
        if (!Array.isArray(raw) || raw.length > MAX_CAMPAIGN_LISTS) {
            throw badRequest(`'${field}' must be a list of at most ${MAX_CAMPAIGN_LISTS} list uids.`);
        }
        const uids: string[] = [...new Set(raw)] as string[];
        for (const uid of uids) {
            if (!(await this.findList(workspaceUid, uid))) {
                throw badRequest(`'${field}' must hold lists of the workspace.`);
            }
        }
        return uids;
    }

    private async readAbTest(workspaceUid: string, raw: unknown): Promise<AbTest> {
        if (!isObject(raw)) {
            throw badRequest("'abTest' must be an object.");
        }
        if (!Array.isArray(raw.variants) || raw.variants.length < 2 || raw.variants.length > VARIANT_IDS.length) {
            throw badRequest(`'abTest.variants' must be a list of 2 to ${VARIANT_IDS.length} variants.`);
        }
        const variants: CampaignVariant[] = [];
        for (const [index, entry] of (raw.variants as unknown[]).entries()) {
            if (!isObject(entry)) {
                throw badRequest("Each A/B variant must be an object.");
            }
            const subject: string | null | undefined = readText(entry, "subject", { max: 998 });
            const variant: CampaignVariant = { id: VARIANT_IDS[index] };
            if (subject) {
                checkMergeTags(subject, "");
                variant.subject = subject;
            }
            if (entry.templateUid !== undefined && entry.templateUid !== null) {
                variant.templateUid = (await this.requireTemplate(workspaceUid, entry.templateUid, "abTest.variants.templateUid")).uid;
            }
            variants.push(variant);
        }
        const metric = readEnum(raw, "metric", Object.values(AbMetric), { required: true })!;
        const testPercent: number = readNumber(raw, "testPercent", { integer: true, min: 5, max: 50 }) ?? 20;
        const testHours: number = readNumber(raw, "testHours", { integer: true, min: 1, max: 168 }) ?? 4;
        return { variants, metric, testPercent, testHours };
    }

    private async requireTemplate(workspaceUid: string, uid: unknown, field: string): Promise<EmailTemplate> {
        const template: EmailTemplate | undefined =
            typeof uid === "string" && uid.length > 0 && uid.length <= 64
                ? await (await this.repo<EmailTemplate>("template")).findOne(uid, { ignoreACL: true, skipCache: true })
                : undefined;
        if (!template || template.workspaceUid !== workspaceUid) {
            throw badRequest(`'${field}' must be a template of the workspace.`);
        }
        return template;
    }

    protected override async afterDelete(record: Campaign): Promise<void> {
        for (const name of ["outboundSend", "engagementEvent"] as const) {
            await (await this.repo(name)).truncate({ sourceUid: ModelUtils.literal(record.uid) }, { ignoreACL: true, skipPush: true });
        }
    }

    protected override async beforeDelete(record: Campaign): Promise<void> {
        if (RUNNING.has(record.status)) {
            throw badRequest("Cancel the campaign before deleting it.");
        }
    }

    /** The campaign, after checking the caller may do `action` on its workspace. */
    private async requireCampaign(user: JWTUser | undefined, workspaceUid: string, uid: string, action: WorkspaceAction): Promise<Campaign> {
        await this.requireAccess(user, workspaceUid, action);
        return await this.requireRecord(workspaceUid, uid);
    }

    /** What stands in the way of sending `campaign`. */
    public async problems(campaign: Campaign): Promise<CampaignProblem[]> {
        const problems: CampaignProblem[] = [];
        const workspace = await this.requireWorkspaceRecord(campaign.workspaceUid);
        if (!workspace.postalAddress) {
            problems.push({ field: "workspace", message: "Add your postal address in the workspace settings: every campaign email shows it." });
        }
        const sender: WorkspaceSender | undefined = campaign.senderUid
            ? await (await this.repo<WorkspaceSender>("workspaceSender")).findOne(campaign.senderUid, { ignoreACL: true, skipCache: true })
            : undefined;
        if (!sender) {
            problems.push({ field: "senderUid", message: "Choose who the campaign is from." });
        }
        let listed: number = 0;
        for (const listUid of campaign.listUids) {
            listed += (await this.findList(campaign.workspaceUid, listUid)) ? 1 : 0;
        }
        if (listed === 0) {
            problems.push({ field: "listUids", message: "Choose at least one list to send to." });
        }
        const variants: CampaignVariant[] = campaign.abTest?.variants ?? [{ id: "A" }];
        for (const variant of variants) {
            const templateUid: string | undefined = variant.templateUid ?? campaign.templateUid;
            const where: string = campaign.abTest ? ` (variant ${variant.id})` : "";
            const template: EmailTemplate | undefined = templateUid
                ? await (await this.repo<EmailTemplate>("template")).findOne(templateUid, { ignoreACL: true, skipCache: true })
                : undefined;
            if (!template) {
                problems.push({ field: "templateUid", message: `Choose the email to send${where}.` });
                continue;
            }
            if (!hasUnsubscribeLink(template.design as TemplateDesign)) {
                problems.push({ field: "templateUid", message: `Add a footer or an unsubscribe link to the template "${template.name}"${where}.` });
            }
            try {
                checkMergeTags(variant.subject ?? template.subject, await compileDesign(template.design as TemplateDesign, template.preheader ?? undefined));
            } catch (err: any) {
                problems.push({ field: "templateUid", message: `${err.message}${where}` });
            }
        }
        return problems;
    }

    @Get("/:workspaceUid/:uid/checklist")
    public async checklist(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<CampaignProblem[]> {
        return await this.problems(await this.requireCampaign(user, workspaceUid, uid, WorkspaceAction.READ));
    }

    @Post("/:workspaceUid/:uid/schedule")
    public async schedule(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, body: unknown, @AuthUser user?: JWTUser): Promise<Campaign> {
        const campaign: Campaign = await this.requireCampaign(user, workspaceUid, uid, WorkspaceAction.WRITE);
        if (campaign.status !== CampaignStatus.DRAFT) {
            throw badRequest("Only a draft campaign can be scheduled.");
        }
        const sendAt: Date | null | undefined = readDate(body === undefined ? {} : requireObject(body), "sendAt");
        const problems: CampaignProblem[] = await this.problems(campaign);
        if (problems.length > 0) {
            throw badRequest(problems[0].message);
        }
        return await this.transition(campaign, { status: CampaignStatus.SCHEDULED, scheduledAt: sendAt ?? new Date() });
    }

    @Post("/:workspaceUid/:uid/unschedule")
    public async unschedule(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<Campaign> {
        const campaign: Campaign = await this.requireCampaign(user, workspaceUid, uid, WorkspaceAction.WRITE);
        if (campaign.status !== CampaignStatus.SCHEDULED) {
            throw badRequest("Only a scheduled campaign that hasn't started can go back to a draft.");
        }
        return await this.transition(campaign, { status: CampaignStatus.DRAFT, scheduledAt: null } as any);
    }

    @Post("/:workspaceUid/:uid/pause")
    public async pause(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<Campaign> {
        const campaign: Campaign = await this.requireCampaign(user, workspaceUid, uid, WorkspaceAction.WRITE);
        if (campaign.status !== CampaignStatus.PREPARING && campaign.status !== CampaignStatus.SENDING) {
            throw badRequest("Only a campaign that is going out can be paused.");
        }
        return await this.transition(campaign, { status: CampaignStatus.PAUSED, leaseExpiresAt: null } as any);
    }

    @Post("/:workspaceUid/:uid/resume")
    public async resume(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<Campaign> {
        const campaign: Campaign = await this.requireCampaign(user, workspaceUid, uid, WorkspaceAction.WRITE);
        if (campaign.status !== CampaignStatus.PAUSED) {
            throw badRequest("Only a paused campaign can be resumed.");
        }
        return await this.transition(campaign, { status: campaign.audienceDone ? CampaignStatus.SENDING : CampaignStatus.PREPARING });
    }

    @Post("/:workspaceUid/:uid/cancel")
    public async cancel(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<Campaign> {
        const campaign: Campaign = await this.requireCampaign(user, workspaceUid, uid, WorkspaceAction.WRITE);
        if (campaign.status !== CampaignStatus.SCHEDULED && !RUNNING.has(campaign.status)) {
            throw badRequest("Only a scheduled campaign, or one going out, can be cancelled.");
        }
        return await this.transition(campaign, { status: CampaignStatus.CANCELLED, finishedAt: new Date(), leaseExpiresAt: null } as any);
    }

    @Post("/:workspaceUid/:uid/duplicate")
    public async duplicate(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<Campaign> {
        const campaign: Campaign = await this.requireCampaign(user, workspaceUid, uid, WorkspaceAction.WRITE);
        return await this.create(
            workspaceUid,
            {
                name: `Copy of ${campaign.name}`.slice(0, 256),
                templateUid: campaign.templateUid ?? undefined,
                senderUid: campaign.senderUid ?? undefined,
                listUids: campaign.listUids.filter(Boolean),
                excludeListUids: campaign.excludeListUids,
                trackOpens: campaign.trackOpens,
                trackClicks: campaign.trackClicks,
                abTest: campaign.abTest
                    ? { variants: campaign.abTest.variants, metric: campaign.abTest.metric, testPercent: campaign.abTest.testPercent, testHours: campaign.abTest.testHours }
                    : undefined,
            },
            user,
        );
    }

    @Post("/:workspaceUid/audience")
    public async audience(@Param("workspaceUid") workspaceUid: string, body: unknown, @AuthUser user?: JWTUser): Promise<{ count: number; capped: boolean }> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        const request: Record<string, unknown> = requireObject(body);
        return await countAudience(this.repos(), {
            workspaceUid,
            listUids: await this.readLists(workspaceUid, request.listUids ?? [], "listUids"),
            excludeListUids: await this.readLists(workspaceUid, request.excludeListUids ?? [], "excludeListUids"),
        });
    }

    @Get("/:workspaceUid/:uid/report")
    public async report(
        @Param("workspaceUid") workspaceUid: string,
        @Param("uid") uid: string,
        @AuthUser user?: JWTUser,
    ): Promise<{ campaign: Campaign; stats: CampaignStats; links: LinkClicks[] }> {
        const campaign: Campaign = await this.requireCampaign(user, workspaceUid, uid, WorkspaceAction.READ);
        const stats: CampaignStats = await campaignStats(
            await this.repo<OutboundSend>("outboundSend"),
            campaign.uid,
            campaign.abTest?.variants.map((variant) => variant.id),
        );
        return {
            campaign: JSON.parse(JSON.stringify(campaign)),
            stats,
            links: await linkClicks(await this.repo<EngagementEvent>("engagementEvent"), campaign.uid),
        };
    }

    @Post("/:workspaceUid/:uid/recipients")
    public async recipients(
        @Param("workspaceUid") workspaceUid: string,
        @Param("uid") uid: string,
        body: unknown,
        @AuthUser user?: JWTUser,
    ): Promise<SearchResult<OutboundSend>> {
        const campaign: Campaign = await this.requireCampaign(user, workspaceUid, uid, WorkspaceAction.READ);
        const request: Record<string, unknown> = body === undefined ? {} : requireObject(body);
        const paging = readPaging(request.limit, request.page);
        const status: SendStatus | null | undefined = readEnum(request, "status", Object.values(SendStatus));
        const engagement: string | null | undefined = readEnum(request, "engagement", Object.keys(ENGAGEMENTS));
        const q: string | null | undefined = readText(request, "q");
        const query: Record<string, unknown> = {
            sourceUid: ModelUtils.literal(campaign.uid),
            ...(status ? { status: ModelUtils.literal(status) } : {}),
            ...(engagement ? { [ENGAGEMENTS[engagement]]: ModelUtils.literal(null, "ne") } : {}),
            ...(q ? { email: `like(*${q.toLowerCase().replace(/[*?\\]/g, "")}*)` } : {}),
        };
        const repo: RepoUtils<OutboundSend> = await this.repo<OutboundSend>("outboundSend");
        const total: number = await repo.count(query, { ignoreACL: true, skipCache: true });
        const items: OutboundSend[] = await repo.find({ ...query, sort: { email: "ASC" } }, { ignoreACL: true, limit: paging.limit, page: paging.page, skipCache: true });
        return { items: items.map(({ token: _token, ...rest }) => JSON.parse(JSON.stringify(rest))), total };
    }

    /** `campaign` with `changes`, saved (version-checked against the jobs) and pushed. */
    private async transition(campaign: Campaign, changes: Partial<Campaign>): Promise<Campaign> {
        const updated: Campaign = await (await this.records()).update({ ...changes, uid: campaign.uid, version: campaign.version }, campaign, {
            ignoreACL: true,
            skipPush: true,
        });
        const view: Campaign = JSON.parse(JSON.stringify(updated));
        this.notify(campaign.workspaceUid, this.pushType, "update", view);
        return view;
    }

}
