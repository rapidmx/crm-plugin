///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils, RepoUtils, RouteDecorators } from "@rapidrest/service-core";
import type { JWTUser } from "@rapidrest/core";
import {
    CrmContact,
    CrmObjectType,
    Deal,
    DealStatus,
    EngagementEvent,
    EngagementType,
    MailingList,
    OutboundSend,
    SendStatus,
    Subscription,
    SubscriptionStatus,
    TimelineEvent,
    TimelineKind,
    WorkspaceAction,
} from "../models/types.js";
import { badRequest } from "../util/Validation.js";
import { CrmRouteBase } from "./CrmRouteBase.js";
const { Get, Param, Query, User: AuthUser } = RouteDecorators;

/** The most rows one report reads of one kind, so a report on a busy workspace stays bounded. */
export const MAX_REPORT_ROWS = 200_000;
const PAGE = 1000;

/** One day of email numbers: how many messages each thing happened to, that day. */
export interface EmailDay {
    date: string;
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    unsubscribed: number;
}

export interface EmailReport {
    days: EmailDay[];
    /** Messages sent in the window, and how many of them each thing happened to. */
    totals: { sent: number; opened: number; clicked: number; replied: number; bounced: number; unsubscribed: number; complained: number };
    /** The recipient domains messages went to most, with their open and click counts. */
    domains: { domain: string; sent: number; opened: number; clicked: number }[];
}

export interface GrowthDay {
    date: string;
    contacts: number;
    subscribed: number;
    unsubscribed: number;
}

export interface GrowthReport {
    days: GrowthDay[];
    contacts: number;
    lists: { uid: string; name: string; subscribed: number }[];
}

export interface SalesDay {
    date: string;
    created: number;
    wonAmount: number;
    won: number;
    lost: number;
}

export interface SalesReport {
    days: SalesDay[];
    open: { count: number; amount: number };
    won: { count: number; amount: number };
    lost: number;
}

/** `date` as its UTC day, `YYYY-MM-DD`. */
function day(date: Date | string): string {
    return new Date(date).toISOString().slice(0, 10);
}

/** Every day of the last `count` days, oldest first, ending today (UTC). */
export function lastDays(count: number, now: Date = new Date()): string[] {
    return Array.from({ length: count }, (_value, index) => day(new Date(now.getTime() - (count - 1 - index) * 86_400_000)));
}

/**
 * A workspace's reports (`/api/mail/crm/analytics`), each over the last `days` (1 to 365, 30 by default), by UTC day:
 * - `GET /:workspaceUid/email` - messages sent, opened, clicked, replied to, bounced and unsubscribed from, per day and in all, and
 * the recipient domains mailed most (`EmailReport`). Opens by machines don't count.
 * - `GET /:workspaceUid/growth` - new contacts, subscribes and unsubscribes per day, and each list's subscribers now (`GrowthReport`).
 * - `GET /:workspaceUid/sales?pipelineUid=` - deals created, won (and their value) and lost per day, and what is open (`SalesReport`).
 *
 * Reports read at most `MAX_REPORT_ROWS` rows of each kind.
 */
export abstract class BaseAnalyticsRoute extends CrmRouteBase {
    private readDays(query: Record<string, unknown> | undefined): number {
        const days: number = Number(query?.days ?? 30);
        if (!Number.isInteger(days) || days < 1 || days > 365) {
            throw badRequest("'days' must be a whole number from 1 to 365.");
        }
        return days;
    }

    /** Every row of `repo` matching `query`, in uid order, at most `MAX_REPORT_ROWS`. */
    private async all<T extends { uid: string }>(repo: RepoUtils<T>, query: Record<string, unknown>): Promise<T[]> {
        const rows: T[] = [];
        let after: string | undefined;
        while (rows.length < MAX_REPORT_ROWS) {
            const page: T[] = await repo.find({ ...query, ...(after ? { uid: ModelUtils.literal(after, "gt") } : {}), sort: { uid: "ASC" } }, { ignoreACL: true, limit: PAGE, skipCache: true });
            rows.push(...page);
            if (page.length < PAGE) {
                break;
            }
            after = page[page.length - 1].uid;
        }
        return rows;
    }

    @Get("/:workspaceUid/email")
    public async email(@Param("workspaceUid") workspaceUid: string, @Query() query: Record<string, unknown> | undefined, @AuthUser user?: JWTUser): Promise<EmailReport> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        const count: number = this.readDays(query);
        const dates: string[] = lastDays(count);
        const since: Date = new Date(`${dates[0]}T00:00:00.000Z`);
        const events: EngagementEvent[] = await this.all(await this.repo<EngagementEvent>("engagementEvent"), {
            workspaceUid: ModelUtils.literal(workspaceUid),
            occurredAt: ModelUtils.literal(since, "gte"),
        });
        const keys: Partial<Record<EngagementType, keyof Omit<EmailDay, "date">>> = {
            [EngagementType.SENT]: "sent",
            [EngagementType.OPENED]: "opened",
            [EngagementType.CLICKED]: "clicked",
            [EngagementType.REPLIED]: "replied",
            [EngagementType.BOUNCED]: "bounced",
            [EngagementType.UNSUBSCRIBED]: "unsubscribed",
        };
        // Each message counts once per thing per day, and once per thing in the totals.
        const perDay: Map<string, Set<string>> = new Map();
        const overall: Map<string, Set<string>> = new Map();
        for (const event of events) {
            if (event.data?.machine) {
                continue;
            }
            const dayKey: string = `${day(event.occurredAt)}|${event.type}`;
            perDay.set(dayKey, (perDay.get(dayKey) ?? new Set()).add(event.sendUid));
            overall.set(event.type, (overall.get(event.type) ?? new Set()).add(event.sendUid));
        }
        const days: EmailDay[] = dates.map((date) => {
            const entry: EmailDay = { date, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, unsubscribed: 0 };
            for (const [type, key] of Object.entries(keys)) {
                entry[key] = perDay.get(`${date}|${type}`)?.size ?? 0;
            }
            return entry;
        });
        const total = (type: EngagementType) => overall.get(type)?.size ?? 0;
        const sends: OutboundSend[] = await this.all(await this.repo<OutboundSend>("outboundSend"), {
            workspaceUid: ModelUtils.literal(workspaceUid),
            status: ModelUtils.literal(SendStatus.SENT),
            sentAt: ModelUtils.literal(since, "gte"),
        });
        const domains: Map<string, { domain: string; sent: number; opened: number; clicked: number }> = new Map();
        for (const send of sends) {
            const domain: string = send.email.slice(send.email.lastIndexOf("@") + 1);
            const entry = domains.get(domain) ?? { domain, sent: 0, opened: 0, clicked: 0 };
            entry.sent++;
            entry.opened += send.firstOpenedAt && !send.machineOpen ? 1 : 0;
            entry.clicked += send.firstClickedAt ? 1 : 0;
            domains.set(domain, entry);
        }
        return {
            days,
            totals: {
                sent: total(EngagementType.SENT),
                opened: total(EngagementType.OPENED),
                clicked: total(EngagementType.CLICKED),
                replied: total(EngagementType.REPLIED),
                bounced: total(EngagementType.BOUNCED),
                unsubscribed: total(EngagementType.UNSUBSCRIBED),
                complained: total(EngagementType.COMPLAINED),
            },
            domains: [...domains.values()].sort((a, b) => b.sent - a.sent || a.domain.localeCompare(b.domain)).slice(0, 10),
        };
    }

    @Get("/:workspaceUid/growth")
    public async growth(@Param("workspaceUid") workspaceUid: string, @Query() query: Record<string, unknown> | undefined, @AuthUser user?: JWTUser): Promise<GrowthReport> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        const dates: string[] = lastDays(this.readDays(query));
        const since: Date = new Date(`${dates[0]}T00:00:00.000Z`);
        const scope = { workspaceUid: ModelUtils.literal(workspaceUid) };
        const contactRepo: RepoUtils<CrmContact> = await this.repo<CrmContact>("contact");
        const created: CrmContact[] = await this.all(contactRepo, { ...scope, dateCreated: ModelUtils.literal(since, "gte") });
        const changes: TimelineEvent[] = await this.all(await this.repo<TimelineEvent>("timelineEvent"), {
            ...scope,
            subjectType: ModelUtils.literal(CrmObjectType.CONTACT),
            kind: ModelUtils.literal([TimelineKind.SUBSCRIBED, TimelineKind.UNSUBSCRIBED], "in"),
            occurredAt: ModelUtils.literal(since, "gte"),
        });
        const days: GrowthDay[] = dates.map((date) => ({
            date,
            contacts: created.filter((contact) => day(contact.dateCreated) === date).length,
            subscribed: changes.filter((entry) => entry.kind === TimelineKind.SUBSCRIBED && day(entry.occurredAt) === date).length,
            unsubscribed: changes.filter((entry) => entry.kind === TimelineKind.UNSUBSCRIBED && day(entry.occurredAt) === date).length,
        }));
        const lists: MailingList[] = await (await this.repo<MailingList>("mailingList")).find({ ...scope, sort: { name: "ASC" } }, { ignoreACL: true, limit: 200, skipCache: true });
        const subscriptions: RepoUtils<Subscription> = await this.repo<Subscription>("subscription");
        return {
            days,
            contacts: await contactRepo.count(scope, { ignoreACL: true, skipCache: true }),
            lists: await Promise.all(
                lists.map(async (list) => ({
                    uid: list.uid,
                    name: list.name,
                    subscribed: await subscriptions.count(
                        { listUid: ModelUtils.literal(list.uid), status: ModelUtils.literal(SubscriptionStatus.SUBSCRIBED) },
                        { ignoreACL: true, skipCache: true },
                    ),
                })),
            ),
        };
    }

    @Get("/:workspaceUid/sales")
    public async sales(@Param("workspaceUid") workspaceUid: string, @Query() query: Record<string, unknown> | undefined, @AuthUser user?: JWTUser): Promise<SalesReport> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        const dates: string[] = lastDays(this.readDays(query));
        const since: Date = new Date(`${dates[0]}T00:00:00.000Z`);
        const pipelineUid: unknown = query?.pipelineUid;
        const scope: Record<string, unknown> = {
            workspaceUid: ModelUtils.literal(workspaceUid),
            ...(typeof pipelineUid === "string" && pipelineUid && pipelineUid.length <= 64 ? { pipelineUid: ModelUtils.literal(pipelineUid) } : {}),
        };
        const deals: RepoUtils<Deal> = await this.repo<Deal>("deal");
        const created: Deal[] = await this.all(deals, { ...scope, dateCreated: ModelUtils.literal(since, "gte") });
        const closed: Deal[] = await this.all(deals, { ...scope, closedAt: ModelUtils.literal(since, "gte") });
        const open: Deal[] = await this.all(deals, { ...scope, status: ModelUtils.literal(DealStatus.OPEN) });
        const won: Deal[] = closed.filter((deal) => deal.status === DealStatus.WON);
        return {
            days: dates.map((date) => {
                const wonToday: Deal[] = won.filter((deal) => day(deal.closedAt!) === date);
                return {
                    date,
                    created: created.filter((deal) => day(deal.dateCreated) === date).length,
                    won: wonToday.length,
                    wonAmount: wonToday.reduce((sum, deal) => sum + deal.amount, 0),
                    lost: closed.filter((deal) => deal.status === DealStatus.LOST && day(deal.closedAt!) === date).length,
                };
            }),
            open: { count: open.length, amount: open.reduce((sum, deal) => sum + deal.amount, 0) },
            won: { count: won.length, amount: won.reduce((sum, deal) => sum + deal.amount, 0) },
            lost: closed.filter((deal) => deal.status === DealStatus.LOST).length,
        };
    }
}
