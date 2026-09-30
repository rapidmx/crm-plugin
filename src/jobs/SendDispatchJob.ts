///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { ModelUtils, RateLimiter, RepoUtils } from "@rapidrest/service-core";
import type { MailTransport, TransportResult } from "@rapidmx/restapi";
import {
    Campaign,
    CampaignStatus,
    CrmContact,
    EmailStatus,
    EngagementType,
    OutboundSend,
    SendSource,
    SendStatus,
    Subscription,
    SubscriptionStatus,
} from "../models/types.js";
import { suppressedAmong } from "../sending/Audience.js";
import { CampaignMessage, CampaignRenderer, UnrenderableError } from "../sending/CampaignRenderer.js";
import { EngagementRecorder } from "../sending/Engagement.js";
import { CrmJobBase } from "./CrmJobBase.js";
const { Config, Inject } = ObjectDecorators;

/** The shared counter every replica's sends are counted against (`RateLimiter`, in Redis when there is one). */
const RATE_KEY = "crm-send|all";

/**
 * Sends queued campaign messages (`OutboundSend`s the `CampaignJob` created): renders each for its contact (`CampaignRenderer`) and
 * hands it to the mail transport.
 *
 * - **Throughput** is capped across replicas at `mail:crm:send_rate_per_minute` (a shared `RateLimiter` counter); a run stops at the cap
 * and the next carries on.
 * - **One replica per message**: a message is claimed with a version-checked update that leases it; a replica that dies mid-send
 * leaves the lease to run out, and the message is sent again (at least once).
 * - **Last-moment checks**: a message whose contact has gone, unsubscribed from the campaign's lists or all email, bounced or was
 * suppressed since is `suppressed`, not sent. A paused campaign's messages wait; a cancelled one's are dropped.
 * - **Failures**: a temporary refusal is retried with backoff (up to `max_attempts`); a permanent one fails the message, and a
 * refusal of the address itself (a `5.1.x` status) counts as a hard bounce - suppressing it.
 */
export abstract class SendDispatchJob extends CrmJobBase {
    @Inject("MailTransport")
    protected mailTransport?: MailTransport;

    @Inject(RateLimiter)
    protected rateLimiter?: RateLimiter;

    @Config("mail:crm:jobs:send:schedule", "*/2 * * * * *")
    protected scheduleExpr: string = "*/2 * * * * *";

    @Config("mail:crm:jobs:send:batch", 200)
    protected batchSize: number = 200;

    @Config("mail:crm:jobs:send:lease_seconds", 300)
    protected leaseSeconds: number = 300;

    @Config("mail:crm:jobs:send:max_attempts", 5)
    protected maxAttempts: number = 5;

    @Config("mail:crm:send_rate_per_minute", 600)
    protected ratePerMinute: number = 600;

    @Config("mail:crm:verp", true)
    protected verp: boolean = true;

    public get schedule(): string | undefined {
        return this.scheduleExpr;
    }

    public async run(): Promise<void> {
        if (!this.mailTransport) {
            return;
        }
        const repo: RepoUtils<OutboundSend> = await this.repo<OutboundSend>("outboundSend");
        const now: Date = new Date();
        const due: OutboundSend[] = await repo.find(
            {
                $or: [
                    { status: ModelUtils.literal(SendStatus.QUEUED), nextAttemptAt: ModelUtils.literal(now, "lte"), leaseExpiresAt: ModelUtils.literal(null) },
                    { status: ModelUtils.literal(SendStatus.QUEUED), nextAttemptAt: ModelUtils.literal(now, "lte"), leaseExpiresAt: ModelUtils.literal(now, "lt") },
                ],
                sort: { nextAttemptAt: "ASC" },
            },
            { ignoreACL: true, limit: this.batchSize, skipCache: true },
        );
        if (due.length === 0) {
            return;
        }
        const renderer = new CampaignRenderer(this.repos(), {
            publicUrl: this.publicUrl.replace(/\/+$/, ""),
            secret: await this.tokenSecret(),
            verp: this.verp,
        });
        const campaigns: Map<string, Promise<Campaign | undefined>> = new Map();
        for (const candidate of due) {
            try {
                if (!(await this.dispatch(candidate, renderer, campaigns))) {
                    return;
                }
            } catch (err: any) {
                this.logger?.error(`SendDispatchJob: send ${candidate.uid} failed: ${err?.message ?? err}`);
            }
        }
    }

    /** Sends one message if it may go. `false` stops the run (the rate cap was reached). */
    private async dispatch(candidate: OutboundSend, renderer: CampaignRenderer, campaigns: Map<string, Promise<Campaign | undefined>>): Promise<boolean> {
        let campaign: Promise<Campaign | undefined> | undefined = campaigns.get(candidate.sourceUid);
        if (!campaign) {
            campaign = this.repo<Campaign>("campaign").then((repo) => repo.findOne(candidate.sourceUid, { ignoreACL: true, skipCache: true }));
            campaigns.set(candidate.sourceUid, campaign);
        }
        const source: Campaign | undefined = candidate.sourceType === SendSource.CAMPAIGN ? await campaign : undefined;
        if (!source || source.status === CampaignStatus.CANCELLED) {
            await this.finish(candidate, { status: SendStatus.CANCELLED });
            return true;
        }
        if (source.status !== CampaignStatus.SENDING) {
            return true;
        }
        try {
            await this.rateLimiter?.checkAndIncrement(RATE_KEY, { maxAttempts: this.ratePerMinute, windowSeconds: 60, ip: { enabled: false } });
        } catch {
            return false;
        }
        const send: OutboundSend | undefined = await this.claim(candidate);
        if (!send) {
            return true;
        }
        const contact: CrmContact | undefined = await this.eligibleContact(send, source);
        if (!contact) {
            await this.finish(send, { status: SendStatus.SUPPRESSED });
            return true;
        }
        let message: CampaignMessage;
        try {
            message = await renderer.render(send, source, contact);
        } catch (err: any) {
            const permanent: boolean = err instanceof UnrenderableError;
            await this.failed(send, `Could not render the message: ${err?.message ?? err}`, !permanent);
            return true;
        }
        let result: TransportResult;
        try {
            result = await this.mailTransport!.send({ raw: message.raw, envelopeFrom: message.envelopeFrom, envelopeTo: [contact.email] });
        } catch (err: any) {
            await this.failed(send, `The mail transport failed: ${err?.message ?? err}`, true);
            return true;
        }
        if (result.accepted.length > 0) {
            const sent: OutboundSend = await this.finish(send, { status: SendStatus.SENT, sentAt: new Date(), messageId: message.messageId, email: contact.email, error: null } as any);
            await this.recorder().record(sent, EngagementType.SENT, { subject: message.subject });
            return true;
        }
        const failure = result.failures?.find((entry) => entry.address === contact.email) ?? result.failures?.[0];
        const temporary: boolean = failure?.temporary ?? (result.error as { temporary?: boolean } | undefined)?.temporary ?? (failure?.code !== undefined ? failure.code < 500 : true);
        const reason: string = failure?.response ?? result.error?.message ?? "The mail transport refused the message.";
        const failed: OutboundSend = await this.failed(send, reason, temporary);
        if (!temporary && /^5\.1\./.test(failure?.enhancedCode ?? "")) {
            await this.recorder().record(failed, EngagementType.BOUNCED, { bounceType: "hard", status: failure!.enhancedCode });
        }
        return true;
    }

    /** Takes `candidate` for this replica, or `undefined` when another took it first. */
    private async claim(candidate: OutboundSend): Promise<OutboundSend | undefined> {
        try {
            return await (await this.repo<OutboundSend>("outboundSend")).update(
                {
                    uid: candidate.uid,
                    version: candidate.version,
                    attempts: candidate.attempts + 1,
                    leaseExpiresAt: new Date(Date.now() + this.leaseSeconds * 1000),
                } as any,
                candidate,
                { ignoreACL: true, skipPush: true },
            );
        } catch (err: any) {
            if (/version/i.test(err?.message ?? "")) {
                return undefined;
            }
            throw err;
        }
    }

    /** The contact of `send` if they may still be mailed: active, not suppressed, and still on one of the campaign's lists. */
    private async eligibleContact(send: OutboundSend, campaign: Campaign): Promise<CrmContact | undefined> {
        const contact: CrmContact | undefined = await (await this.repo<CrmContact>("contact")).findOne(send.contactUid, { ignoreACL: true, skipCache: true });
        if (!contact || contact.emailStatus !== EmailStatus.ACTIVE) {
            return undefined;
        }
        if ((await suppressedAmong(this.repos(), send.workspaceUid, [contact.email])).size > 0) {
            return undefined;
        }
        const subscribed: Subscription[] = await (await this.repo<Subscription>("subscription")).find(
            {
                contactUid: ModelUtils.literal(contact.uid),
                listUid: ModelUtils.literal(campaign.listUids, "in"),
                status: ModelUtils.literal(SubscriptionStatus.SUBSCRIBED),
            },
            { ignoreACL: true, limit: 1, skipCache: true },
        );
        return subscribed.length > 0 ? contact : undefined;
    }

    /** A failed attempt: retried later with backoff while `temporary` and attempts remain, else the message fails. */
    private async failed(send: OutboundSend, error: string, temporary: boolean): Promise<OutboundSend> {
        if (temporary && send.attempts < this.maxAttempts) {
            // 1, 2, 4, 8... minutes.
            const delay: number = 60_000 * 2 ** (send.attempts - 1);
            return await this.finish(send, { status: SendStatus.QUEUED, nextAttemptAt: new Date(Date.now() + delay), error: error.slice(0, 1000) });
        }
        const failed: OutboundSend = await this.finish(send, { status: SendStatus.FAILED, error: error.slice(0, 1000) });
        await this.recorder().record(failed, EngagementType.FAILED, { error: error.slice(0, 500) });
        return failed;
    }

    /** Saves `changes` on a claimed message and releases its lease. */
    private async finish(send: OutboundSend, changes: Partial<OutboundSend>): Promise<OutboundSend> {
        return await (await this.repo<OutboundSend>("outboundSend")).update({ ...changes, leaseExpiresAt: null, uid: send.uid, version: send.version } as any, send, {
            ignoreACL: true,
            skipPush: true,
        });
    }

    private recorder(): EngagementRecorder {
        return new EngagementRecorder(this.repos(), this.classes, this.logger);
    }
}
