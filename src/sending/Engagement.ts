///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils } from "@rapidrest/service-core";
import type { CrmModelClasses, CrmRepos } from "../models/CrmModelClasses.js";
import {
    Campaign,
    CrmContact,
    CrmObjectType,
    EmailStatus,
    EngagementType,
    OutboundSend,
    SendSource,
    Suppression,
    SuppressionReason,
    TimelineKind,
} from "../models/types.js";

/** How often a send's update is retried when another write to it got there first. */
const UPDATE_ATTEMPTS = 5;

/** What an engagement event may say. */
export interface EngagementData extends Record<string, unknown> {
    /** An open or click that looked automatic (`isMachine()`). */
    machine?: boolean;
    /** A click's link. */
    url?: string;
    index?: number;
    /** A bounce's `hard` or `soft`, and its enhanced status code. */
    bounceType?: "hard" | "soft";
    status?: string;
}

/**
 * Records what happened to an outbound message: an `EngagementEvent`, the message's own counters and first-times (what campaign
 * statistics count), and what follows for the contact:
 * - An open, click or reply makes the contact engaged (`lastEngagedAt`) - an automatic open doesn't.
 * - The first open, the first click, a reply, a bounce and a complaint go on the contact's timeline.
 * - A hard bounce or a complaint suppresses the address and marks the contact `bounced` or `complained`, so nothing more is sent to it.
 *
 * Replies, complaints and unsubscribes count once per message; a hard bounce once (a soft one may be followed by a hard one).
 */
export class EngagementRecorder {
    constructor(
        private readonly repos: CrmRepos,
        private readonly classes: CrmModelClasses,
        private readonly logger?: any,
    ) {}

    /** Records `type` for `send` (as of `at`) - see the class comment. Returns the send as updated, or `undefined` for an ignored repeat. */
    public async record(send: OutboundSend, type: EngagementType, data: EngagementData = {}, at: Date = new Date()): Promise<OutboundSend | undefined> {
        const updated: OutboundSend | undefined = await this.updateSend(send, type, data, at);
        if (!updated) {
            return undefined;
        }
        await (await this.repos.get("engagementEvent")).create(
            new this.classes.engagementEvent({
                workspaceUid: send.workspaceUid,
                sendUid: send.uid,
                sourceType: send.sourceType,
                sourceUid: send.sourceUid,
                contactUid: send.contactUid,
                variantId: send.variantId,
                type,
                occurredAt: at,
                data,
            }),
            { ignoreACL: true, skipPush: true },
        );
        await this.followUp(send, updated, type, data, at);
        return updated;
    }

    /**
     * Applies `type` to the send's fields, retrying on version conflicts from a fresh read. `undefined` when it's a repeat that doesn't
     * count (a second reply, complaint, unsubscribe or hard bounce).
     */
    private async updateSend(send: OutboundSend, type: EngagementType, data: EngagementData, at: Date): Promise<OutboundSend | undefined> {
        const repo = await this.repos.get<OutboundSend>("outboundSend");
        let current: OutboundSend = send;
        for (let attempt = 1; ; attempt++) {
            const changes: Partial<OutboundSend> | undefined = this.changesFor(current, type, data, at);
            if (!changes) {
                return undefined;
            }
            if (Object.keys(changes).length === 0) {
                return current;
            }
            try {
                return await repo.update({ ...changes, uid: current.uid, version: current.version } as any, current, { ignoreACL: true, skipPush: true });
            } catch (err: any) {
                if (attempt >= UPDATE_ATTEMPTS || !/version/i.test(err?.message ?? "")) {
                    throw err;
                }
                current = (await repo.findOne(send.uid, { ignoreACL: true, skipCache: true }))!;
            }
        }
    }

    /** What `type` changes on `send`: `{}` for nothing, `undefined` for a repeat to ignore. */
    private changesFor(send: OutboundSend, type: EngagementType, data: EngagementData, at: Date): Partial<OutboundSend> | undefined {
        switch (type) {
            case EngagementType.OPENED: {
                const first: boolean = !send.firstOpenedAt;
                return {
                    openCount: send.openCount + 1,
                    lastOpenedAt: at,
                    ...(first ? { firstOpenedAt: at, machineOpen: !!data.machine } : { machineOpen: send.machineOpen && !!data.machine }),
                };
            }
            case EngagementType.CLICKED:
                // A click proves the message was opened, whatever the image said.
                return {
                    clickCount: send.clickCount + 1,
                    ...(send.firstClickedAt ? {} : { firstClickedAt: at }),
                    ...(send.firstOpenedAt ? {} : { firstOpenedAt: at, lastOpenedAt: at }),
                    ...(data.machine ? {} : { machineOpen: false }),
                };
            case EngagementType.BOUNCED:
                if (send.bounceType === "hard") {
                    return undefined;
                }
                return { bouncedAt: send.bouncedAt ?? at, bounceType: data.bounceType ?? "hard" };
            case EngagementType.REPLIED:
                return send.repliedAt ? undefined : { repliedAt: at };
            case EngagementType.COMPLAINED:
                return send.complainedAt ? undefined : { complainedAt: at };
            case EngagementType.UNSUBSCRIBED:
                return send.unsubscribedAt ? undefined : { unsubscribedAt: at };
            default:
                // SENT and FAILED: the dispatch job has already set the send's status.
                return {};
        }
    }

    /** The contact-side consequences of an event - see the class comment. Failures are logged, not thrown: the event is recorded. */
    private async followUp(before: OutboundSend, after: OutboundSend, type: EngagementType, data: EngagementData, at: Date): Promise<void> {
        try {
            const engaged: boolean =
                (type === EngagementType.OPENED && !data.machine) || (type === EngagementType.CLICKED && !data.machine) || type === EngagementType.REPLIED;
            const hard: boolean = type === EngagementType.BOUNCED && after.bounceType === "hard";
            if (engaged || hard || type === EngagementType.COMPLAINED) {
                await this.updateContact(after, {
                    ...(engaged ? { lastEngagedAt: at } : {}),
                    ...(hard ? { emailStatus: EmailStatus.BOUNCED } : {}),
                    ...(type === EngagementType.COMPLAINED ? { emailStatus: EmailStatus.COMPLAINED } : {}),
                });
            }
            if (hard || type === EngagementType.COMPLAINED) {
                await this.suppress(after, hard ? SuppressionReason.HARD_BOUNCE : SuppressionReason.COMPLAINT);
            }
            const timeline = await this.timelineEntry(before, after, type, data);
            if (timeline) {
                await (await this.repos.get("timelineEvent")).create(
                    new this.classes.timelineEvent({
                        workspaceUid: after.workspaceUid,
                        subjectType: CrmObjectType.CONTACT,
                        subjectUid: after.contactUid,
                        kind: timeline.kind,
                        summary: timeline.summary,
                        occurredAt: at,
                        data: { sendUid: after.uid, sourceType: after.sourceType, sourceUid: after.sourceUid, ...(data.url ? { url: data.url } : {}) },
                        refUid: after.sourceUid,
                    }),
                    { ignoreACL: true, skipPush: true },
                );
            }
        } catch (err: any) {
            this.logger?.warn(`EngagementRecorder: could not update the contact of send ${after.uid}: ${err?.message ?? err}`);
        }
    }

    private async updateContact(send: OutboundSend, changes: Partial<CrmContact>): Promise<void> {
        const repo = await this.repos.get<CrmContact>("contact");
        const contact: CrmContact | undefined = await repo.findOne(send.contactUid, { ignoreACL: true, skipCache: true });
        if (!contact) {
            return;
        }
        // A bounce or complaint outranks an unsubscribe, but never undoes the other.
        if (changes.emailStatus && contact.emailStatus !== EmailStatus.ACTIVE && contact.emailStatus !== EmailStatus.UNSUBSCRIBED) {
            delete changes.emailStatus;
        }
        if (Object.keys(changes).length > 0) {
            await repo.update({ ...changes, uid: contact.uid, version: contact.version } as any, contact, { ignoreACL: true, skipPush: true });
        }
    }

    private async suppress(send: OutboundSend, reason: SuppressionReason): Promise<void> {
        const repo = await this.repos.get<Suppression>("suppression");
        const existing: Suppression[] = await repo.find(
            { workspaceUid: ModelUtils.literal(send.workspaceUid), email: ModelUtils.literal(send.email) },
            { ignoreACL: true, limit: 1, skipCache: true },
        );
        if (existing.length === 0) {
            await repo.create(new this.classes.suppression({ workspaceUid: send.workspaceUid, email: send.email, reason, note: `Send ${send.uid}` }), {
                ignoreACL: true,
                skipPush: true,
            });
        }
    }

    /** The timeline entry an event makes, if any: the first open, the first click, a reply, a bounce, a complaint. */
    private async timelineEntry(
        before: OutboundSend,
        after: OutboundSend,
        type: EngagementType,
        data: EngagementData,
    ): Promise<{ kind: TimelineKind; summary: string } | undefined> {
        const name: string = await this.sourceName(after);
        switch (type) {
            case EngagementType.SENT:
                return { kind: TimelineKind.EMAIL_SENT, summary: `Sent ${name}` };
            case EngagementType.OPENED:
                // The first open that looked like a person's.
                return !data.machine && (!before.firstOpenedAt || before.machineOpen) ? { kind: TimelineKind.EMAIL_OPENED, summary: `Opened ${name}` } : undefined;
            case EngagementType.CLICKED:
                return !before.firstClickedAt ? { kind: TimelineKind.EMAIL_CLICKED, summary: `Clicked a link in ${name}` } : undefined;
            case EngagementType.REPLIED:
                return { kind: TimelineKind.EMAIL_REPLIED, summary: `Replied to ${name}` };
            case EngagementType.BOUNCED:
                return { kind: TimelineKind.EMAIL_BOUNCED, summary: `${name} bounced (${after.bounceType})` };
            case EngagementType.COMPLAINED:
                return { kind: TimelineKind.EMAIL_COMPLAINED, summary: `Reported ${name} as spam` };
            default:
                return undefined;
        }
    }

    /** How the timeline names what was sent: the campaign's name in quotes, or "an email". */
    private async sourceName(send: OutboundSend): Promise<string> {
        if (send.sourceType === SendSource.CAMPAIGN) {
            const campaign: Campaign | undefined = await (await this.repos.get<Campaign>("campaign")).findOne(send.sourceUid, { ignoreACL: true });
            if (campaign) {
                return `"${campaign.name}"`;
            }
        }
        return "an email";
    }
}
