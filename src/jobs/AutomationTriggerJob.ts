///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { ModelUtils, RepoUtils } from "@rapidrest/service-core";
import { AutomationEngine, contactMatches, triggerMatches, triggerOf } from "../automation/Engine.js";
import { WAIT_EVENTS } from "../automation/Graph.js";
import { CrmEventType } from "../automation/Events.js";
import { Automation, AutomationStatus, AutomationVersion, CrmContact, CrmEvent } from "../models/types.js";
import { CrmJobBase } from "./CrmJobBase.js";
const { Config } = ObjectDecorators;

/** An active automation with its published version, as the trigger job matches events against it. */
interface LiveAutomation {
    automation: Automation;
    version: AutomationVersion;
}

/**
 * Hands each new `CrmEvent` to its workspace's automations, once (an event is claimed by stamping `dispatchedAt`, version-checked):
 * - it **enrolls** the contact in every active automation whose trigger matches the event (and whose trigger filter, if any, the
 * contact matches), as the automation's re-entry rule allows;
 * - it **resumes** the contact's enrollments waiting for this event about this message (`AutomationEngine.resumeWaiting()`).
 *
 * Dispatched events are deleted after `retention_days`.
 */
export abstract class AutomationTriggerJob extends CrmJobBase {
    @Config("mail:crm:jobs:triggers:schedule", "*/5 * * * * *")
    protected scheduleExpr: string = "*/5 * * * * *";

    @Config("mail:crm:jobs:triggers:batch", 200)
    protected batchSize: number = 200;

    @Config("mail:crm:jobs:triggers:retention_days", 30)
    protected retentionDays: number = 30;

    public get schedule(): string | undefined {
        return this.scheduleExpr;
    }

    /** The engine: enrolling and resuming waits change no contact, so it needs no contact route. */
    protected engine(): AutomationEngine {
        return new AutomationEngine({ repos: this.repos(), classes: this.classes, notificationUtils: this.notificationUtils, logger: this.logger });
    }

    public async run(): Promise<void> {
        const events: RepoUtils<CrmEvent> = await this.repo<CrmEvent>("crmEvent");
        const due: CrmEvent[] = await events.find(
            { dispatchedAt: ModelUtils.literal(null), sort: { occurredAt: "ASC" } },
            { ignoreACL: true, limit: this.batchSize, skipCache: true },
        );
        const engine: AutomationEngine = this.engine();
        const automations: Map<string, Promise<LiveAutomation[]>> = new Map();
        for (const candidate of due) {
            try {
                const event: CrmEvent = await events.update({ uid: candidate.uid, version: candidate.version, dispatchedAt: new Date() }, candidate, {
                    ignoreACL: true,
                    skipPush: true,
                });
                let live: Promise<LiveAutomation[]> | undefined = automations.get(event.workspaceUid);
                if (!live) {
                    live = this.liveAutomations(event.workspaceUid);
                    automations.set(event.workspaceUid, live);
                }
                await this.dispatch(engine, event, await live);
            } catch (err: any) {
                if (!/version/i.test(err?.message ?? "")) {
                    this.logger?.error(`AutomationTriggerJob: event ${candidate.uid} failed: ${err?.message ?? err}`);
                }
            }
        }
        await events.truncate({ dispatchedAt: ModelUtils.literal(new Date(Date.now() - this.retentionDays * 86_400_000), "lt") }, { ignoreACL: true });
    }

    private async dispatch(engine: AutomationEngine, event: CrmEvent, live: LiveAutomation[]): Promise<void> {
        let contact: CrmContact | undefined | null = null;
        for (const { automation, version } of live) {
            const trigger = triggerOf(version.graph as any)!;
            if (!triggerMatches(trigger, event)) {
                continue;
            }
            if (trigger.config.filter) {
                contact = contact === null ? await (await this.repo<CrmContact>("contact")).findOne(event.contactUid, { ignoreACL: true, skipCache: true }) : contact;
                if (!contact || !(await contactMatches(this.repos(), contact, trigger.config.filter))) {
                    continue;
                }
            }
            await engine.enroll(automation, version, event.contactUid, event.type);
        }
        if (WAIT_EVENTS.includes(event.type as CrmEventType)) {
            await engine.resumeWaiting(event);
        }
    }

    /** The workspace's active automations and their published versions. */
    private async liveAutomations(workspaceUid: string): Promise<LiveAutomation[]> {
        const automations: Automation[] = await (await this.repo<Automation>("automation")).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), status: ModelUtils.literal(AutomationStatus.ACTIVE) },
            { ignoreACL: true, limit: 500, skipCache: true },
        );
        const versions: RepoUtils<AutomationVersion> = await this.repo<AutomationVersion>("automationVersion");
        const live: LiveAutomation[] = [];
        for (const automation of automations) {
            const version: AutomationVersion | undefined = automation.publishedVersionUid ? await versions.findOne(automation.publishedVersionUid, { ignoreACL: true }) : undefined;
            if (version) {
                live.push({ automation, version });
            }
        }
        return live;
    }
}
