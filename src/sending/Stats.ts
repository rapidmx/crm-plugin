///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils, RepoUtils } from "@rapidrest/service-core";
import { CampaignCounts, CampaignStats, EngagementEvent, EngagementType, OutboundSend, SendStatus } from "../models/types.js";

/** Counts with every number zero. */
export function emptyCounts(): CampaignCounts {
    return { recipients: 0, sent: 0, failed: 0, suppressed: 0, bounced: 0, opened: 0, clicked: 0, replied: 0, unsubscribed: 0, complained: 0 };
}

const NOT_NULL = () => ModelUtils.literal(null, "ne");

/** The conditions of each count, on a source's sends. `opened` leaves out messages only machines opened. */
const COUNTS: [keyof CampaignCounts, () => Record<string, unknown>][] = [
    ["recipients", () => ({})],
    ["sent", () => ({ status: ModelUtils.literal(SendStatus.SENT) })],
    ["failed", () => ({ status: ModelUtils.literal(SendStatus.FAILED) })],
    ["suppressed", () => ({ status: ModelUtils.literal(SendStatus.SUPPRESSED) })],
    ["bounced", () => ({ bouncedAt: NOT_NULL() })],
    ["opened", () => ({ firstOpenedAt: NOT_NULL(), machineOpen: ModelUtils.literal(false) })],
    ["clicked", () => ({ firstClickedAt: NOT_NULL() })],
    ["replied", () => ({ repliedAt: NOT_NULL() })],
    ["unsubscribed", () => ({ unsubscribedAt: NOT_NULL() })],
    ["complained", () => ({ complainedAt: NOT_NULL() })],
];

/** The counts of the sends of `sourceUid` (one variant's, when given). Cancelled sends aren't recipients. */
export async function countSends(repo: RepoUtils<OutboundSend>, sourceUid: string, variantId?: string): Promise<CampaignCounts> {
    const counts: CampaignCounts = emptyCounts();
    const base: Record<string, unknown> = {
        sourceUid: ModelUtils.literal(sourceUid),
        ...(variantId !== undefined ? { variantId: ModelUtils.literal(variantId) } : {}),
    };
    for (const [key, condition] of COUNTS) {
        const extra = condition();
        counts[key] = await repo.count(
            { ...base, ...(key === "recipients" ? { status: ModelUtils.literal([SendStatus.CANCELLED, SendStatus.HELD], "nin") } : {}), ...extra },
            { ignoreACL: true, skipCache: true },
        );
    }
    return counts;
}

/** A campaign's stats: the counts overall and, for an A/B test, per variant. */
export async function campaignStats(repo: RepoUtils<OutboundSend>, campaignUid: string, variantIds?: string[]): Promise<CampaignStats> {
    const stats: CampaignStats = await countSends(repo, campaignUid);
    if (variantIds && variantIds.length > 0) {
        stats.variants = {};
        for (const variantId of variantIds) {
            stats.variants[variantId] = await countSends(repo, campaignUid, variantId);
        }
    }
    return stats;
}

/** One link's clicks in a campaign. */
export interface LinkClicks {
    url: string;
    clicks: number;
    /** How many recipients clicked it. */
    uniqueClicks: number;
}

/** A campaign's links by clicks, most first - from at most `maxEvents` click events. */
export async function linkClicks(repo: RepoUtils<EngagementEvent>, sourceUid: string, maxEvents: number = 50_000): Promise<LinkClicks[]> {
    const byUrl: Map<string, { clicks: number; senders: Set<string> }> = new Map();
    const pageSize = 1000;
    for (let page = 0; page * pageSize < maxEvents; page++) {
        const events: EngagementEvent[] = await repo.find(
            { sourceUid: ModelUtils.literal(sourceUid), type: ModelUtils.literal(EngagementType.CLICKED), sort: { occurredAt: "ASC" } },
            { ignoreACL: true, limit: pageSize, page, skipCache: true },
        );
        for (const event of events) {
            const url: string = String(event.data?.url ?? "");
            const entry = byUrl.get(url) ?? { clicks: 0, senders: new Set<string>() };
            entry.clicks++;
            entry.senders.add(event.sendUid);
            byUrl.set(url, entry);
        }
        if (events.length < pageSize) {
            break;
        }
    }
    return [...byUrl.entries()]
        .map(([url, entry]) => ({ url, clicks: entry.clicks, uniqueClicks: entry.senders.size }))
        .sort((a, b) => b.clicks - a.clicks || a.url.localeCompare(b.url));
}
