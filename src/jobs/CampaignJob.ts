///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { ModelUtils, RepoUtils } from "@rapidrest/service-core";
import { AbMetric, Campaign, CampaignCounts, CampaignStats, CampaignStatus, CrmContact, OutboundSend, SendSource, SendStatus } from "../models/types.js";
import { AudiencePage, assignVariant, audiencePage } from "../sending/Audience.js";
import { campaignStats, countSends } from "../sending/Stats.js";
import { newSendToken } from "../sending/Tracking.js";
import { CrmJobBase } from "./CrmJobBase.js";
const { Config } = ObjectDecorators;

/** How many sends one run moves (releases after an A/B test, cancels). */
const MOVE_BATCH = 500;
/** How long after finishing a campaign's stats keep being recounted. */
const STATS_DAYS = 14;

/**
 * Moves campaigns along, on every replica but one campaign on one replica at a time (version-checked claims with a lease):
 * 1. **Starts** scheduled campaigns once due (`preparing`).
 * 2. **Prepares** them: reads the audience page by page (resumable from `audienceCursor`), creating one queued `OutboundSend` per
 * contact - unique per campaign and contact - or a held one, for an A/B test's remainder. Then `sending`, or straight to `sent`
 * when nobody was left to send to.
 * 3. **Decides A/B tests** once `testHours` have passed since starting, by the best `metric` rate among the test messages sent, and
 * releases the held messages as the winner.
 * 4. **Drops** the unsent messages of cancelled campaigns.
 * 5. **Finishes** campaigns with nothing left to send.
 * 6. **Counts** the stats of campaigns going out or recently finished, at most every `stats_seconds`.
 */
export abstract class CampaignJob extends CrmJobBase {
    @Config("mail:crm:jobs:campaign:schedule", "*/5 * * * * *")
    protected scheduleExpr: string = "*/5 * * * * *";

    @Config("mail:crm:jobs:campaign:lease_seconds", 120)
    protected leaseSeconds: number = 120;

    /** How many audience pages one run prepares per campaign, so a run stays short. */
    @Config("mail:crm:jobs:campaign:pages_per_run", 20)
    protected pagesPerRun: number = 20;

    /** How many subscriptions one audience page reads. */
    @Config("mail:crm:jobs:campaign:page_size", 500)
    protected audiencePageSize: number = 500;

    @Config("mail:crm:jobs:campaign:stats_seconds", 60)
    protected statsSeconds: number = 60;

    public get schedule(): string | undefined {
        return this.scheduleExpr;
    }

    public async run(): Promise<void> {
        const now: Date = new Date();
        for (const step of [
            () => this.startDue(now),
            () => this.prepare(now),
            () => this.decideTests(now),
            () => this.releaseHeld(),
            () => this.dropCancelled(),
            () => this.finishDone(),
            () => this.countStats(now),
        ]) {
            try {
                await step();
            } catch (err: any) {
                this.logger?.error(`CampaignJob: ${err?.message ?? err}`);
            }
        }
    }

    private async campaigns(query: Record<string, unknown>, limit: number = 20): Promise<Campaign[]> {
        return await (await this.repo<Campaign>("campaign")).find(query, { ignoreACL: true, limit, skipCache: true });
    }

    /** `campaign` with `changes`, or `undefined` when someone changed it first (a member paused or cancelled it, another replica). */
    private async save(campaign: Campaign, changes: Partial<Campaign>): Promise<Campaign | undefined> {
        try {
            const saved: Campaign = await (await this.repo<Campaign>("campaign")).update({ ...changes, uid: campaign.uid, version: campaign.version } as any, campaign, {
                ignoreACL: true,
                skipPush: true,
            });
            this.notify(saved.workspaceUid, "CrmCampaign", saved);
            return saved;
        } catch (err: any) {
            if (/version/i.test(err?.message ?? "")) {
                return undefined;
            }
            throw err;
        }
    }

    private lease(): Date {
        return new Date(Date.now() + this.leaseSeconds * 1000);
    }

    private async startDue(now: Date): Promise<void> {
        const due: Campaign[] = await this.campaigns({ status: ModelUtils.literal(CampaignStatus.SCHEDULED), scheduledAt: ModelUtils.literal(now, "lte"), sort: { scheduledAt: "ASC" } });
        for (const campaign of due) {
            await this.save(campaign, { status: CampaignStatus.PREPARING, startedAt: now, leaseExpiresAt: null } as any);
        }
    }

    private async prepare(now: Date): Promise<void> {
        const preparing: Campaign[] = await this.campaigns({
            $or: [
                { status: ModelUtils.literal(CampaignStatus.PREPARING), leaseExpiresAt: ModelUtils.literal(null) },
                { status: ModelUtils.literal(CampaignStatus.PREPARING), leaseExpiresAt: ModelUtils.literal(now, "lt") },
            ],
            sort: { dateModified: "ASC" },
        });
        for (const candidate of preparing) {
            let campaign: Campaign | undefined = await this.save(candidate, { leaseExpiresAt: this.lease() });
            for (let page = 0; campaign?.status === CampaignStatus.PREPARING && page < this.pagesPerRun; page++) {
                campaign = await this.preparePage(campaign);
            }
            if (campaign?.status === CampaignStatus.PREPARING) {
                // Let the next run - on any replica - carry on.
                await this.save(campaign, { leaseExpiresAt: null } as any);
            }
        }
    }

    /** Reads one audience page into sends. Returns the campaign as saved, or `undefined` when it was changed behind the job's back. */
    private async preparePage(campaign: Campaign): Promise<Campaign | undefined> {
        const page: AudiencePage = await audiencePage(
            this.repos(),
            {
                workspaceUid: campaign.workspaceUid,
                listUids: campaign.listUids,
                excludeListUids: campaign.excludeListUids,
                segmentUids: campaign.segmentUids ?? [],
                excludeSegmentUids: campaign.excludeSegmentUids ?? [],
            },
            campaign.audienceCursor ?? undefined,
            this.audiencePageSize,
        );
        const created: number = await this.createSends(campaign, page.contacts);
        if (page.nextCursor) {
            return await this.save(campaign, { audienceCursor: page.nextCursor, recipientCount: campaign.recipientCount + created, leaseExpiresAt: this.lease() });
        }
        // Counted, not added up: a page read again after a replica died counts the messages it created the first time.
        const recipientCount: number = await (await this.repo<OutboundSend>("outboundSend")).count({ sourceUid: ModelUtils.literal(campaign.uid) }, { ignoreACL: true, skipCache: true });
        return await this.save(campaign, {
            audienceCursor: null,
            audienceDone: true,
            recipientCount,
            leaseExpiresAt: null,
            ...(recipientCount === 0 ? { status: CampaignStatus.SENT, finishedAt: new Date(), error: "Nobody on the campaign's lists could be sent to." } : { status: CampaignStatus.SENDING }),
        } as any);
    }

    /** Creates a send for each contact the campaign has none for yet. Returns how many were created. */
    private async createSends(campaign: Campaign, contacts: CrmContact[]): Promise<number> {
        const repo: RepoUtils<OutboundSend> = await this.repo<OutboundSend>("outboundSend");
        const keys: Map<string, CrmContact> = new Map(contacts.map((contact) => [`campaign:${campaign.uid}:${contact.uid}`, contact]));
        if (keys.size === 0) {
            return 0;
        }
        const existing: OutboundSend[] = await repo.find({ dedupeKey: ModelUtils.literal([...keys.keys()], "in") }, { ignoreACL: true, limit: keys.size, skipCache: true });
        existing.forEach((send) => keys.delete(send.dedupeKey));
        let created: number = 0;
        for (const [dedupeKey, contact] of keys) {
            const variantId: string = assignVariant(campaign.uid, contact.uid, campaign.abTest ?? undefined);
            try {
                await repo.create(
                    new this.classes.outboundSend({
                        workspaceUid: campaign.workspaceUid,
                        sourceType: SendSource.CAMPAIGN,
                        sourceUid: campaign.uid,
                        dedupeKey,
                        contactUid: contact.uid,
                        email: contact.email,
                        variantId,
                        status: variantId === "" ? SendStatus.HELD : SendStatus.QUEUED,
                        token: newSendToken(),
                        nextAttemptAt: new Date(),
                    }),
                    { ignoreACL: true, skipPush: true },
                );
                created++;
            } catch (err: any) {
                // Created by a replica that prepared the same page before its lease ran out: already there, which is all that matters.
                this.logger?.debug?.(`CampaignJob: send ${dedupeKey} not created: ${err?.message ?? err}`);
            }
        }
        return created;
    }

    private async decideTests(now: Date): Promise<void> {
        const sending: Campaign[] = await this.campaigns({ status: ModelUtils.literal(CampaignStatus.SENDING), abTest: ModelUtils.literal(null, "ne") }, 100);
        for (const campaign of sending) {
            const test = campaign.abTest!;
            if (test.winnerId || !campaign.startedAt || new Date(campaign.startedAt).getTime() + test.testHours * 3_600_000 > now.getTime()) {
                continue;
            }
            const repo: RepoUtils<OutboundSend> = await this.repo<OutboundSend>("outboundSend");
            let winner: { id: string; rate: number } | undefined;
            for (const variant of test.variants) {
                const rate: number = metricRate(await countSends(repo, campaign.uid, variant.id), test.metric);
                if (!winner || rate > winner.rate) {
                    winner = { id: variant.id, rate };
                }
            }
            await this.save(campaign, { abTest: { ...test, winnerId: winner!.id, decidedAt: now } });
        }
    }

    private async releaseHeld(): Promise<void> {
        const sending: Campaign[] = await this.campaigns({ status: ModelUtils.literal(CampaignStatus.SENDING), abTest: ModelUtils.literal(null, "ne") }, 100);
        for (const campaign of sending.filter((entry) => entry.abTest?.winnerId)) {
            await this.moveSends(campaign, SendStatus.HELD, { status: SendStatus.QUEUED, variantId: campaign.abTest!.winnerId!, nextAttemptAt: new Date() });
        }
    }

    private async dropCancelled(): Promise<void> {
        const recent: Date = new Date(Date.now() - STATS_DAYS * 86_400_000);
        const cancelled: Campaign[] = await this.campaigns({ status: ModelUtils.literal(CampaignStatus.CANCELLED), finishedAt: ModelUtils.literal(recent, "gte") }, 100);
        for (const campaign of cancelled) {
            for (const status of [SendStatus.QUEUED, SendStatus.HELD]) {
                await this.moveSends(campaign, status, { status: SendStatus.CANCELLED });
            }
        }
    }

    /** Changes up to `MOVE_BATCH` of the campaign's sends in `from`. A send a replica holds a lease on is left for later. */
    private async moveSends(campaign: Campaign, from: SendStatus, changes: Partial<OutboundSend>): Promise<void> {
        const repo: RepoUtils<OutboundSend> = await this.repo<OutboundSend>("outboundSend");
        const sends: OutboundSend[] = await repo.find(
            { sourceUid: ModelUtils.literal(campaign.uid), status: ModelUtils.literal(from) },
            { ignoreACL: true, limit: MOVE_BATCH, skipCache: true },
        );
        const now: number = Date.now();
        for (const send of sends) {
            if (send.leaseExpiresAt && new Date(send.leaseExpiresAt).getTime() > now) {
                continue;
            }
            try {
                await repo.update({ ...changes, uid: send.uid, version: send.version }, send, { ignoreACL: true, skipPush: true });
            } catch (err: any) {
                this.logger?.debug?.(`CampaignJob: send ${send.uid} changed meanwhile: ${err?.message ?? err}`);
            }
        }
    }

    private async finishDone(): Promise<void> {
        const sending: Campaign[] = await this.campaigns({ status: ModelUtils.literal(CampaignStatus.SENDING), audienceDone: ModelUtils.literal(true) }, 100);
        const repo: RepoUtils<OutboundSend> = await this.repo<OutboundSend>("outboundSend");
        for (const campaign of sending) {
            const left: number = await repo.count(
                { sourceUid: ModelUtils.literal(campaign.uid), status: ModelUtils.literal([SendStatus.QUEUED, SendStatus.HELD], "in") },
                { ignoreACL: true, skipCache: true },
            );
            if (left === 0) {
                await this.save(campaign, { status: CampaignStatus.SENT, finishedAt: new Date(), ...(await this.stats(campaign)) });
            }
        }
    }

    private async countStats(now: Date): Promise<void> {
        const stale: Date = new Date(now.getTime() - this.statsSeconds * 1000);
        const recent: Date = new Date(now.getTime() - STATS_DAYS * 86_400_000);
        const active: Campaign[] = await this.campaigns(
            {
                $or: [
                    { status: ModelUtils.literal([CampaignStatus.SENDING, CampaignStatus.PAUSED], "in") },
                    { status: ModelUtils.literal([CampaignStatus.SENT, CampaignStatus.CANCELLED], "in"), finishedAt: ModelUtils.literal(recent, "gte") },
                ],
                sort: { dateModified: "ASC" },
            },
            100,
        );
        for (const campaign of active.filter((entry) => !entry.statsAt || new Date(entry.statsAt).getTime() <= stale.getTime())) {
            await this.save(campaign, await this.stats(campaign));
        }
    }

    private async stats(campaign: Campaign): Promise<{ stats: CampaignStats; statsAt: Date }> {
        return {
            stats: await campaignStats(await this.repo<OutboundSend>("outboundSend"), campaign.uid, campaign.abTest?.variants.map((variant) => variant.id)),
            statsAt: new Date(),
        };
    }
}

/** The share of a variant's sent messages its metric happened to (0 with none sent). */
export function metricRate(counts: CampaignCounts, metric: AbMetric): number {
    if (counts.sent === 0) {
        return 0;
    }
    const hits: number = metric === AbMetric.OPEN ? counts.opened : metric === AbMetric.CLICK ? counts.clicked : counts.replied;
    return hits / counts.sent;
}
