///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils, RepoUtils } from "@rapidrest/service-core";
import { FilterNode } from "../filters/Filter.js";
import type { CrmRepos } from "../models/CrmModelClasses.js";
import {
    CrmContact,
    CrmObjectType,
    EngagementEvent,
    EngagementType,
    ScoringActivity,
    ScoringKind,
    ScoringRule,
    TimelineEvent,
    TimelineKind,
} from "../models/types.js";
import { PAGING, matchingContacts } from "../segments/Segments.js";

/** The most activity rows one rule reads per scoring, so a busy workspace's scoring stays bounded. */
export const MAX_ACTIVITY_ROWS = 200_000;

/** Where each activity is counted from: an engagement event type, or a timeline entry kind. */
const ACTIVITY_SOURCES: Record<ScoringActivity, { engagement: EngagementType } | { timeline: TimelineKind }> = {
    [ScoringActivity.OPENED]: { engagement: EngagementType.OPENED },
    [ScoringActivity.CLICKED]: { engagement: EngagementType.CLICKED },
    [ScoringActivity.REPLIED]: { engagement: EngagementType.REPLIED },
    [ScoringActivity.BOUNCED]: { engagement: EngagementType.BOUNCED },
    [ScoringActivity.FORM_SUBMITTED]: { timeline: TimelineKind.FORM_SUBMITTED },
    [ScoringActivity.SUBSCRIBED]: { timeline: TimelineKind.SUBSCRIBED },
    [ScoringActivity.UNSUBSCRIBED]: { timeline: TimelineKind.UNSUBSCRIBED },
};

/** How many times each contact did an activity rule's activity, within its window. Automatic opens and clicks don't count. */
export async function countActivity(repos: CrmRepos, workspaceUid: string, rule: ScoringRule, now: Date = new Date()): Promise<Map<string, number>> {
    const counts: Map<string, number> = new Map();
    const source = ACTIVITY_SOURCES[rule.activity!];
    const since: Record<string, unknown> = rule.withinDays ? { occurredAt: ModelUtils.literal(new Date(now.getTime() - rule.withinDays * 86_400_000), "gte") } : {};
    const [repo, query, contactOf]: [RepoUtils<any>, Record<string, unknown>, (row: any) => string | undefined] =
        "engagement" in source
            ? [
                  await repos.get<EngagementEvent>("engagementEvent"),
                  { workspaceUid: ModelUtils.literal(workspaceUid), type: ModelUtils.literal(source.engagement), ...since },
                  (row: EngagementEvent) => (row.data?.machine ? undefined : row.contactUid),
              ]
            : [
                  await repos.get<TimelineEvent>("timelineEvent"),
                  {
                      workspaceUid: ModelUtils.literal(workspaceUid),
                      subjectType: ModelUtils.literal(CrmObjectType.CONTACT),
                      kind: ModelUtils.literal(source.timeline),
                      ...since,
                  },
                  (row: TimelineEvent) => row.subjectUid,
              ];
    let after: string | undefined;
    for (let read = 0; read < MAX_ACTIVITY_ROWS; read += PAGING.size) {
        const rows: any[] = await repo.find(
            { ...query, ...(after ? { uid: ModelUtils.literal(after, "gt") } : {}), sort: { uid: "ASC" } },
            { ignoreACL: true, limit: PAGING.size, skipCache: true },
        );
        for (const row of rows) {
            const contactUid: string | undefined = contactOf(row);
            if (contactUid) {
                counts.set(contactUid, (counts.get(contactUid) ?? 0) + 1);
            }
        }
        if (rows.length < PAGING.size) {
            break;
        }
        after = rows[rows.length - 1].uid;
    }
    return counts;
}

/** The points one activity rule gives for `times` times: `points` each, limited to `maxPoints` either way. */
export function activityPoints(rule: Pick<ScoringRule, "points" | "maxPoints">, times: number): number {
    const total: number = rule.points * times;
    if (rule.maxPoints === undefined || rule.maxPoints === null) {
        return total;
    }
    return Math.max(-rule.maxPoints, Math.min(rule.maxPoints, total));
}

/**
 * Scores every contact of `workspaceUid` by its enabled `rules` and saves the scores that changed: each property rule's points for
 * the contacts its filter matches, plus each activity rule's points for what the contact did. With no enabled rules every score
 * goes back to 0. Returns how many contacts' scores changed.
 */
export async function scoreWorkspace(repos: CrmRepos, workspaceUid: string, rules: ScoringRule[], now: Date = new Date()): Promise<number> {
    const perRule: { rule: ScoringRule; points: (contactUid: string) => number }[] = [];
    for (const rule of rules.filter((entry) => entry.enabled)) {
        if (rule.kind === ScoringKind.PROPERTY) {
            const matching: Set<string> = new Set((await matchingContacts(repos, workspaceUid, rule.filter as FilterNode)).uids);
            perRule.push({ rule, points: (contactUid) => (matching.has(contactUid) ? rule.points : 0) });
        } else {
            const counts: Map<string, number> = await countActivity(repos, workspaceUid, rule, now);
            perRule.push({ rule, points: (contactUid) => activityPoints(rule, counts.get(contactUid) ?? 0) });
        }
    }
    const contacts: RepoUtils<CrmContact> = await repos.get<CrmContact>("contact");
    let changed: number = 0;
    let after: string | undefined;
    for (;;) {
        const page: CrmContact[] = await contacts.find(
            { workspaceUid: ModelUtils.literal(workspaceUid), ...(after ? { uid: ModelUtils.literal(after, "gt") } : {}), sort: { uid: "ASC" } },
            { ignoreACL: true, limit: PAGING.size, skipCache: true },
        );
        for (const contact of page) {
            const score: number = perRule.reduce((sum, entry) => sum + entry.points(contact.uid), 0);
            if (score !== contact.score) {
                try {
                    await contacts.update({ uid: contact.uid, version: contact.version, score }, contact, { ignoreACL: true, skipPush: true });
                    changed++;
                } catch {
                    // Changed meanwhile: the next scoring catches it up.
                }
            }
        }
        if (page.length < PAGING.size) {
            return changed;
        }
        after = page[page.length - 1].uid;
    }
}
