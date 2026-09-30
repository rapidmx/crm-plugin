///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { ModelUtils, RepoUtils } from "@rapidrest/service-core";
import { DateRepeat, DateTrigger, addDays, dateFires, dayOf, localTime, readDateTrigger } from "../automation/Dates.js";
import { AutomationEngine, contactMatches, triggerOf } from "../automation/Engine.js";
import { CrmEventType } from "../automation/Events.js";
import { Automation, AutomationStatus, AutomationVersion, CrmContact, CrmObjectType, PropertyValue, Workspace } from "../models/types.js";
import { CrmJobBase } from "./CrmJobBase.js";
const { Config } = ObjectDecorators;

/** The most date values one automation's daily check reads. */
export const MAX_DATE_SCAN = 200_000;
const PAGE = 1000;

/**
 * Puts contacts into automations whose trigger is a date (`date.reached`): a contact's custom date property or its own
 * `dateCreated`/`lastEngagedAt`, on the day - or `offsetDays` before or after it - once or every year.
 *
 * Each active automation is checked once a day, from its trigger's `hour` in its workspace's time zone: the run claims the day by
 * stamping `Automation.dateCheckedOn` (version-checked, so one replica does it), then reads the contacts whose date falls on it and
 * enrolls those matching the trigger's contact filter - as the automation's re-entry rule allows. A day missed (the automation was
 * paused, or no replica ran) isn't made up.
 */
export abstract class DateTriggerJob extends CrmJobBase {
    @Config("mail:crm:jobs:dates:schedule", "20 * * * * *")
    protected scheduleExpr: string = "20 * * * * *";

    public get schedule(): string | undefined {
        return this.scheduleExpr;
    }

    public async run(now: Date = new Date()): Promise<void> {
        const automations: RepoUtils<Automation> = await this.repo<Automation>("automation");
        const versions: RepoUtils<AutomationVersion> = await this.repo<AutomationVersion>("automationVersion");
        const zones: Map<string, string> = new Map();
        const engine = new AutomationEngine({ repos: this.repos(), classes: this.classes, notificationUtils: this.notificationUtils, logger: this.logger });
        let after: string | undefined;
        for (;;) {
            const page: Automation[] = await automations.find(
                { status: ModelUtils.literal(AutomationStatus.ACTIVE), ...(after ? { uid: ModelUtils.literal(after, "gt") } : {}), sort: { uid: "ASC" } },
                { ignoreACL: true, limit: PAGE, skipCache: true },
            );
            for (const automation of page) {
                try {
                    const version: AutomationVersion | undefined = automation.publishedVersionUid
                        ? await versions.findOne(automation.publishedVersionUid, { ignoreACL: true })
                        : undefined;
                    const trigger = version ? triggerOf(version.graph as any) : undefined;
                    if (!version || trigger?.config.event !== CrmEventType.DATE_REACHED) {
                        continue;
                    }
                    let timeZone: string | undefined = zones.get(automation.workspaceUid);
                    if (timeZone === undefined) {
                        const workspace: Workspace | undefined = await (await this.repo<Workspace>("workspace")).findOne(automation.workspaceUid, { ignoreACL: true });
                        timeZone = workspace?.timezone || "UTC";
                        zones.set(automation.workspaceUid, timeZone);
                    }
                    const settings: DateTrigger = readDateTrigger(trigger.config, "trigger");
                    const today = localTime(now, timeZone);
                    if (today.hour < settings.hour || automation.dateCheckedOn === today.date) {
                        continue;
                    }
                    // Claims the day: a replica that loses the race (a version error) leaves it to the winner.
                    const claimed: Automation = await automations.update({ uid: automation.uid, version: automation.version, dateCheckedOn: today.date }, automation, {
                        ignoreACL: true,
                        skipPush: true,
                    });
                    let enrolled: number = 0;
                    for (const contactUid of await this.contactsOn(claimed.workspaceUid, settings, today.date, timeZone)) {
                        if (trigger.config.filter) {
                            const contact: CrmContact | undefined = await (await this.repo<CrmContact>("contact")).findOne(contactUid, { ignoreACL: true, skipCache: true });
                            if (!contact || !(await contactMatches(this.repos(), contact, trigger.config.filter))) {
                                continue;
                            }
                        }
                        enrolled += (await engine.enroll(claimed, version, contactUid, CrmEventType.DATE_REACHED)) ? 1 : 0;
                    }
                    if (enrolled > 0) {
                        this.logger?.info(`DateTriggerJob: put ${enrolled} contact(s) into automation ${claimed.uid} for ${today.date}.`);
                    }
                } catch (err: any) {
                    if (!/version/i.test(err?.message ?? "")) {
                        this.logger?.error(`DateTriggerJob: automation ${automation.uid} failed: ${err?.message ?? err}`);
                    }
                }
            }
            if (page.length < PAGE) {
                return;
            }
            after = page[page.length - 1].uid;
        }
    }

    /** The contacts of the workspace whose date makes `trigger` fire on `today` (`YYYY-MM-DD`, in `timeZone`). */
    private async contactsOn(workspaceUid: string, trigger: DateTrigger, today: string, timeZone: string): Promise<string[]> {
        const target: string = addDays(today, -trigger.offsetDays);
        const once: boolean = trigger.repeat === DateRepeat.ONCE;
        const scope = { workspaceUid: ModelUtils.literal(workspaceUid) };
        const uids: Set<string> = new Set();
        if (trigger.field.startsWith("properties.")) {
            // A custom date is a day, kept as UTC midnight: a one-off date is looked up; an anniversary means reading them all.
            const rows: PropertyValue[] = await this.all(await this.repo<PropertyValue>("propertyValue"), {
                ...scope,
                objectType: ModelUtils.literal(CrmObjectType.CONTACT),
                key: ModelUtils.literal(trigger.field.slice("properties.".length)),
                ...(once ? { dateValue: ModelUtils.literal([new Date(`${target}T00:00:00Z`), new Date(`${target}T23:59:59.999Z`)], "range") } : {}),
            });
            for (const row of rows) {
                if (row.dateValue && dateFires(trigger, dayOf(row.dateValue, trigger.field, timeZone), today)) {
                    uids.add(row.objectUid);
                }
            }
        } else {
            // The contact's own dates are moments: a one-off day is read with a day's margin either side for the time zone.
            const rows: CrmContact[] = await this.all(await this.repo<CrmContact>("contact"), {
                ...scope,
                ...(once ? { [trigger.field]: ModelUtils.literal([new Date(`${addDays(target, -1)}T00:00:00Z`), new Date(`${addDays(target, 1)}T23:59:59.999Z`)], "range") } : {}),
            });
            for (const contact of rows) {
                const value: Date | undefined = (contact as any)[trigger.field];
                if (value && dateFires(trigger, dayOf(value, trigger.field, timeZone), today)) {
                    uids.add(contact.uid);
                }
            }
        }
        return [...uids];
    }

    /** Every row of `repo` matching `query`, in uid order, at most `MAX_DATE_SCAN`. */
    private async all<T extends { uid: string }>(repo: RepoUtils<T>, query: Record<string, unknown>): Promise<T[]> {
        const rows: T[] = [];
        let after: string | undefined;
        while (rows.length < MAX_DATE_SCAN) {
            const page: T[] = await repo.find({ ...query, ...(after ? { uid: ModelUtils.literal(after, "gt") } : {}), sort: { uid: "ASC" } }, { ignoreACL: true, limit: PAGE, skipCache: true });
            rows.push(...page);
            if (page.length < PAGE) {
                break;
            }
            after = page[page.length - 1].uid;
        }
        return rows;
    }
}
