///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import * as crypto from "crypto";
import { ModelUtils } from "@rapidrest/service-core";
import type { CrmRepos } from "../models/CrmModelClasses.js";
import { AbTest, CrmContact, EmailStatus, Subscription, SubscriptionStatus, Suppression } from "../models/types.js";
import { inSegments } from "../segments/Segments.js";

/**
 * Who a campaign goes to: the subscribers of `listUids`, less those of `excludeListUids`; when `segmentUids` isn't empty, only those
 * in one of those segments; and never those in `excludeSegmentUids`.
 */
export interface AudienceSpec {
    workspaceUid: string;
    listUids: string[];
    excludeListUids: string[];
    segmentUids?: string[];
    excludeSegmentUids?: string[];
}

/** One page of an audience. */
export interface AudiencePage {
    /** The contacts of the page who may be mailed: subscribed, not excluded, active and not suppressed. */
    contacts: CrmContact[];
    /** Where the next page starts; `undefined` once the audience is done. */
    nextCursor?: string;
}

/**
 * One page of an audience, read through the lists' subscriptions in uid order after `cursor` (`pageSize` subscriptions a page, so
 * the work of a page is bounded). A contact on several lists shows up once per list - callers de-duplicate (a campaign by its
 * sends' unique `dedupeKey`).
 */
export async function audiencePage(repos: CrmRepos, spec: AudienceSpec, cursor: string | undefined, pageSize: number): Promise<AudiencePage> {
    if (spec.listUids.length === 0) {
        return { contacts: [] };
    }
    const subscriptions: Subscription[] = await (await repos.get<Subscription>("subscription")).find(
        {
            workspaceUid: ModelUtils.literal(spec.workspaceUid),
            listUid: ModelUtils.literal(spec.listUids, "in"),
            status: ModelUtils.literal(SubscriptionStatus.SUBSCRIBED),
            ...(cursor ? { uid: ModelUtils.literal(cursor, "gt") } : {}),
            sort: { uid: "ASC" },
        },
        { ignoreACL: true, limit: pageSize, skipCache: true },
    );
    const nextCursor: string | undefined = subscriptions.length < pageSize ? undefined : subscriptions[subscriptions.length - 1].uid;
    const contactUids: string[] = [...new Set(subscriptions.map((subscription) => subscription.contactUid))];
    if (contactUids.length === 0) {
        return { contacts: [], nextCursor };
    }
    const excluded: Set<string> = new Set();
    if (spec.excludeListUids.length > 0) {
        const exclusions: Subscription[] = await (await repos.get<Subscription>("subscription")).find(
            {
                workspaceUid: ModelUtils.literal(spec.workspaceUid),
                listUid: ModelUtils.literal(spec.excludeListUids, "in"),
                contactUid: ModelUtils.literal(contactUids, "in"),
                status: ModelUtils.literal(SubscriptionStatus.SUBSCRIBED),
            },
            { ignoreACL: true, limit: contactUids.length * spec.excludeListUids.length, skipCache: true },
        );
        exclusions.forEach((subscription) => excluded.add(subscription.contactUid));
    }
    const contacts: CrmContact[] = (
        await (await repos.get<CrmContact>("contact")).find(
            { workspaceUid: ModelUtils.literal(spec.workspaceUid), uid: ModelUtils.literal(contactUids, "in") },
            { ignoreACL: true, limit: contactUids.length, skipCache: true },
        )
    ).filter((contact) => contact.emailStatus === EmailStatus.ACTIVE && !excluded.has(contact.uid));
    const uids: string[] = contacts.map((contact) => contact.uid);
    const wanted: Set<string> | undefined = spec.segmentUids?.length ? await inSegments(repos, spec.segmentUids, uids) : undefined;
    const unwanted: Set<string> = await inSegments(repos, spec.excludeSegmentUids ?? [], uids);
    const suppressed: Set<string> = await suppressedAmong(
        repos,
        spec.workspaceUid,
        contacts.map((contact) => contact.email),
    );
    return {
        contacts: contacts.filter((contact) => !suppressed.has(contact.email) && (!wanted || wanted.has(contact.uid)) && !unwanted.has(contact.uid)),
        nextCursor,
    };
}

/** Which of `emails` the workspace has suppressed. */
export async function suppressedAmong(repos: CrmRepos, workspaceUid: string, emails: string[]): Promise<Set<string>> {
    if (emails.length === 0) {
        return new Set();
    }
    const rows: Suppression[] = await (await repos.get<Suppression>("suppression")).find(
        { workspaceUid: ModelUtils.literal(workspaceUid), email: ModelUtils.literal(emails, "in") },
        { ignoreACL: true, limit: emails.length, skipCache: true },
    );
    return new Set(rows.map((row) => row.email));
}

/** How many distinct contacts an audience would reach, counting at most `cap` (then `capped`). */
export async function countAudience(repos: CrmRepos, spec: AudienceSpec, cap: number = 100_000): Promise<{ count: number; capped: boolean }> {
    const seen: Set<string> = new Set();
    let cursor: string | undefined;
    do {
        const page: AudiencePage = await audiencePage(repos, spec, cursor, 1000);
        page.contacts.forEach((contact) => seen.add(contact.uid));
        if (seen.size >= cap) {
            return { count: cap, capped: true };
        }
        cursor = page.nextCursor;
    } while (cursor);
    return { count: seen.size, capped: false };
}

/**
 * The A/B variant a contact gets: `A` without a test; with one, `testPercent` of contacts (chosen by a hash of the campaign and
 * contact, so the choice is stable however the audience is read) are spread evenly over the variants, and the rest get `""` - held
 * for the winner.
 */
export function assignVariant(campaignUid: string, contactUid: string, abTest: AbTest | undefined): string {
    if (!abTest) {
        return "A";
    }
    const hash: Buffer = crypto.createHash("sha256").update(`${campaignUid}|${contactUid}`).digest();
    if (hash.readUInt32BE(0) / 0x1_0000_0000 >= abTest.testPercent / 100) {
        return "";
    }
    return abTest.variants[hash.readUInt32BE(4) % abTest.variants.length].id;
}
