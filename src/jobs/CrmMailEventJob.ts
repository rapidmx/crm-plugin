///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import os from "node:os";
import { ObjectDecorators } from "@rapidrest/core";
import { ConnectionManager, ModelUtils, RepoUtils } from "@rapidrest/service-core";
import { CrmContact, CrmObjectType, EngagementType, OutboundSend, TimelineEvent, TimelineKind, WorkspaceSender } from "../models/types.js";
import { EngagementRecorder } from "../sending/Engagement.js";
import { tokenFromVerp } from "../sending/Tracking.js";
import { CrmJobBase } from "./CrmJobBase.js";
const { Config, Inject } = ObjectDecorators;

/**
 * The part of `@rapidmx/restapi`'s mail event stream this job reads - the same Redis stream (`MAIL_EVENT_STREAM_KEY`) and entry format
 * (`MessageDeliveredEvent`, JSON in the `event` field). Kept here, not imported, until the plugin depends on a restapi release that
 * exports the stream (0.27): then this job becomes a `MailEventConsumer` subclass and these types go.
 */
export const MAIL_EVENT_STREAM_KEY = "rapidmx:mail-events";

/** A bounce's recipient group, as restapi's `DsnParser` reports it. */
export interface DeliveryStatusRecipient {
    finalRecipient: string;
    status?: string;
    outcome: "delivered" | "delayed" | "soft_bounce" | "hard_bounce";
}

/** restapi's `message.delivered` event: a message filed into a mailbox. */
export interface MessageDeliveredEvent {
    type: "message.delivered";
    occurredAt: string;
    mailboxUid: string;
    messageUid: string;
    envelopeTo: string[];
    fromAddress?: string;
    subject?: string;
    messageId?: string;
    inReplyTo?: string;
    references: string[];
    autoSubmitted?: string;
    precedence?: string;
    deliveryStatusReport?: { originalMessageId?: string; recipients: DeliveryStatusRecipient[] };
    feedbackReport?: { feedbackType: string; originalMessageId?: string };
}

/** restapi's `message.sent` event: a message sent from a mailbox. */
export interface MessageSentEvent {
    type: "message.sent";
    occurredAt: string;
    mailboxUid?: string;
    messageUid?: string;
    messageId: string;
    recipients: string[];
}

/** The Redis commands the job uses. */
export interface StreamRedis {
    xGroupCreate(key: string, group: string, id: string, options?: any): Promise<unknown>;
    xReadGroup(group: string, consumer: string, streams: { key: string; id: string }, options?: any): Promise<any>;
    xAck(key: string, group: string, id: string | string[]): Promise<number>;
    xAutoClaim(key: string, group: string, consumer: string, minIdleTime: number, start: string, options?: any): Promise<any>;
}

/** Automatic mail that never counts as a reply. */
const NOT_A_REPLY = /^(bulk|list|junk|auto_reply)$/i;

/**
 * Learns what became of CRM messages from the mail the workspaces' sender mailboxes receive, read from restapi's mail event stream
 * as the consumer group `crm-plugin` (one replica handles each event; a replica that fails leaves it to be claimed again):
 * - **Bounces** (a delivery status report) of a CRM message - found by its bounce address (`verpAddress()`) or the returned
 * `Message-ID` - record a hard or soft bounce; a hard one suppresses the address.
 * - **Complaints** (an abuse feedback report) of one record a complaint and suppress the address.
 * - **Replies** - a message whose `In-Reply-To`/`References` names a CRM message - record a reply. Automatic mail (`Auto-Submitted`,
 * `Precedence: bulk`...) is not a reply.
 *
 * Only reports and replies filed into the mailbox of the message's own sender count, so nobody can forge engagement by mailing some
 * other mailbox. Without an `events` Redis datastore, the job does nothing.
 */
export abstract class CrmMailEventJob extends CrmJobBase {
    @Inject(ConnectionManager)
    protected connectionManager?: ConnectionManager;

    @Config("mail:events:datastore", "events")
    protected datastoreName: string = "events";

    @Config("mail:crm:jobs:events:schedule", "*/2 * * * * *")
    protected scheduleExpr: string = "*/2 * * * * *";

    protected readonly consumerGroup: string = "crm-plugin";
    protected readonly consumerName: string = `${os.hostname()}-${process.pid}`;
    protected batchSize: number = 100;
    protected maxBatchesPerRun: number = 20;
    protected retryAfterMs: number = 60_000;

    private groupReady: boolean = false;

    public get schedule(): string | undefined {
        return this.scheduleExpr;
    }

    /** The stream's Redis client, if there is one. */
    protected redis(): StreamRedis | undefined {
        const client: any = this.connectionManager?.connections.get(this.datastoreName);
        return client && typeof client.xReadGroup === "function" ? client : undefined;
    }

    public async run(): Promise<void> {
        const redis: StreamRedis | undefined = this.redis();
        if (!redis) {
            return;
        }
        try {
            if (!this.groupReady) {
                try {
                    await redis.xGroupCreate(MAIL_EVENT_STREAM_KEY, this.consumerGroup, "$", { MKSTREAM: true });
                } catch (err: any) {
                    if (!String(err?.message ?? err).includes("BUSYGROUP")) {
                        throw err;
                    }
                }
                this.groupReady = true;
            }
            const claimed: any = await redis.xAutoClaim(MAIL_EVENT_STREAM_KEY, this.consumerGroup, this.consumerName, this.retryAfterMs, "0-0", { COUNT: this.batchSize });
            for (const entry of claimed?.messages ?? []) {
                if (entry) {
                    await this.dispatch(redis, entry);
                }
            }
            for (let batch = 0; batch < this.maxBatchesPerRun; batch++) {
                const reply: any = await redis.xReadGroup(this.consumerGroup, this.consumerName, { key: MAIL_EVENT_STREAM_KEY, id: ">" }, { COUNT: this.batchSize });
                const entries: any[] = reply?.[0]?.messages ?? [];
                for (const entry of entries) {
                    await this.dispatch(redis, entry);
                }
                if (entries.length < this.batchSize) {
                    break;
                }
            }
        } catch (err: any) {
            this.logger?.warn(`CrmMailEventJob: could not read the mail event stream: ${err?.message ?? err}`);
        }
    }

    /** Handles one entry and acknowledges it - unless handling throws, which leaves it to be retried. */
    private async dispatch(redis: StreamRedis, entry: { id: string; message: Record<string, string> }): Promise<void> {
        let event: any;
        try {
            event = JSON.parse(entry.message?.event ?? "");
        } catch {
            event = undefined;
        }
        try {
            if (event?.type === "message.delivered") {
                await this.handle(event as MessageDeliveredEvent);
            } else if (event?.type === "message.sent") {
                await this.handleSent(event as MessageSentEvent);
            }
        } catch (err: any) {
            this.logger?.warn(`CrmMailEventJob: handling mail event ${entry.id} failed: ${err?.message ?? err}`);
            return;
        }
        await redis.xAck(MAIL_EVENT_STREAM_KEY, this.consumerGroup, entry.id);
    }

    /** Records what `event` says about CRM messages, if anything - see the class comment. Idempotent. */
    public async handle(event: MessageDeliveredEvent): Promise<void> {
        const at: Date = new Date(event.occurredAt);
        if (event.deliveryStatusReport) {
            const token: string | undefined = event.envelopeTo.map(tokenFromVerp).find(Boolean);
            const send: OutboundSend | undefined = await this.findSend(event.mailboxUid, token, [event.deliveryStatusReport.originalMessageId]);
            const outcomes = event.deliveryStatusReport.recipients.filter((recipient) => recipient.outcome === "hard_bounce" || recipient.outcome === "soft_bounce");
            if (send && outcomes.length > 0) {
                const hard = outcomes.find((recipient) => recipient.outcome === "hard_bounce");
                const worst: DeliveryStatusRecipient = hard ?? outcomes[0];
                await this.recorder().record(send, EngagementType.BOUNCED, { bounceType: hard ? "hard" : "soft", status: worst.status }, at);
            }
            return;
        }
        if (event.feedbackReport) {
            const send: OutboundSend | undefined = await this.findSend(event.mailboxUid, undefined, [event.feedbackReport.originalMessageId]);
            if (send && event.feedbackReport.feedbackType === "abuse") {
                await this.recorder().record(send, EngagementType.COMPLAINED, {}, at);
            }
            return;
        }
        if ((event.autoSubmitted && event.autoSubmitted.toLowerCase() !== "no") || NOT_A_REPLY.test(event.precedence ?? "")) {
            return;
        }
        const send: OutboundSend | undefined = await this.findSend(event.mailboxUid, undefined, [event.inReplyTo, ...(event.references ?? [])]);
        if (send) {
            await this.recorder().record(send, EngagementType.REPLIED, { messageUid: event.messageUid }, at);
        }
        if (event.fromAddress) {
            await this.logEmail(event.mailboxUid, [event.fromAddress], TimelineKind.EMAIL_RECEIVED, event.messageUid, (mailbox) =>
                `Emailed ${mailbox}${event.subject ? `: ${event.subject}` : ""}`,
            );
        }
    }

    /** Logs a message a logging sender's mailbox sent to contacts (`WorkspaceSender.logEmail`) on their timelines. */
    public async handleSent(event: MessageSentEvent): Promise<void> {
        if (event.mailboxUid) {
            await this.logEmail(event.mailboxUid, event.recipients, TimelineKind.EMAIL_SENT, event.messageUid ?? event.messageId, (mailbox) => `Emailed by ${mailbox}`);
        }
    }

    /**
     * Adds a timeline entry for each of `addresses` that is a contact of a workspace whose sender with mailbox `mailboxUid` logs email -
     * once per message and contact (`refUid`), however often the event comes.
     */
    private async logEmail(mailboxUid: string, addresses: string[], kind: TimelineKind, messageRef: string, summary: (mailbox: string) => string): Promise<void> {
        const senders: WorkspaceSender[] = await (await this.repo<WorkspaceSender>("workspaceSender")).find(
            { mailboxUid: ModelUtils.literal(mailboxUid), logEmail: ModelUtils.literal(true) },
            { ignoreACL: true, limit: 50, skipCache: true },
        );
        const emails: string[] = [...new Set(addresses.map((address) => address.toLowerCase()))].slice(0, 100);
        if (senders.length === 0 || emails.length === 0) {
            return;
        }
        const timeline: RepoUtils<TimelineEvent> = await this.repo<TimelineEvent>("timelineEvent");
        for (const sender of senders) {
            const contacts: CrmContact[] = await (await this.repo<CrmContact>("contact")).find(
                { workspaceUid: ModelUtils.literal(sender.workspaceUid), email: ModelUtils.literal(emails, "in") },
                { ignoreACL: true, limit: emails.length, skipCache: true },
            );
            for (const contact of contacts) {
                const logged: TimelineEvent[] = await timeline.find(
                    { subjectUid: ModelUtils.literal(contact.uid), kind: ModelUtils.literal(kind), refUid: ModelUtils.literal(messageRef) },
                    { ignoreACL: true, limit: 1, skipCache: true },
                );
                if (logged.length === 0) {
                    await timeline.create(
                        new this.classes.timelineEvent({
                            workspaceUid: sender.workspaceUid,
                            subjectType: CrmObjectType.CONTACT,
                            subjectUid: contact.uid,
                            kind,
                            summary: summary(sender.fromAddress).slice(0, 500),
                            occurredAt: new Date(),
                            data: { mailboxUid },
                            refUid: messageRef,
                        }),
                        { ignoreACL: true, skipPush: true },
                    );
                }
            }
        }
    }

    /**
     * The CRM message a bounce, report or reply filed into `mailboxUid` is about - by its token, else by one of `messageIds` - if that
     * message was sent from a sender whose mailbox is `mailboxUid`.
     */
    private async findSend(mailboxUid: string, token: string | undefined, messageIds: (string | undefined)[]): Promise<OutboundSend | undefined> {
        const repo: RepoUtils<OutboundSend> = await this.repo<OutboundSend>("outboundSend");
        const ids: string[] = [...new Set(messageIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 998))].slice(0, 50);
        const query: Record<string, unknown> | undefined = token ? { token: ModelUtils.literal(token) } : ids.length > 0 ? { messageId: ModelUtils.literal(ids, "in") } : undefined;
        if (!query) {
            return undefined;
        }
        for (const send of await repo.find(query, { ignoreACL: true, limit: 10, skipCache: true })) {
            if (await this.sentFrom(send, mailboxUid)) {
                return send;
            }
        }
        return undefined;
    }

    /** Whether `send` went out from a sender whose mailbox is `mailboxUid`. */
    private async sentFrom(send: OutboundSend, mailboxUid: string): Promise<boolean> {
        const campaign: any = send.senderUid ? undefined : await (await this.repo("campaign")).findOne(send.sourceUid, { ignoreACL: true });
        const senderUid: string | undefined = send.senderUid ?? campaign?.senderUid;
        const sender: WorkspaceSender | undefined = senderUid ? await (await this.repo<WorkspaceSender>("workspaceSender")).findOne(senderUid, { ignoreACL: true }) : undefined;
        return sender?.mailboxUid === mailboxUid;
    }

    private recorder(): EngagementRecorder {
        return new EngagementRecorder(this.repos(), this.classes, this.logger);
    }
}
