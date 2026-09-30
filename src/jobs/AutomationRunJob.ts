///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { ModelUtils, RepoUtils } from "@rapidrest/service-core";
import { AutomationEngine } from "../automation/Engine.js";
import { AutomationGraph } from "../automation/Graph.js";
import { Automation, AutomationStatus, AutomationVersion, Enrollment, EnrollmentState } from "../models/types.js";
import type { BaseContactRoute } from "../routes/BaseContactRoute.js";
import { CrmJobBase } from "./CrmJobBase.js";
const { Config } = ObjectDecorators;

/**
 * Takes due enrollments through their automations (`AutomationEngine.advance()`): those whose delay is over, whose wait timed out,
 * or that have steps left. One replica per enrollment: an enrollment is leased with a version-checked update, and its changes are
 * saved with the lease released. A paused automation's enrollments wait, checked again every `paused_retry_seconds`; a deleted
 * automation's are ended.
 */
export abstract class AutomationRunJob extends CrmJobBase {
    protected abstract contactRouteClass: any;

    @Config("mail:crm:jobs:automations:schedule", "*/5 * * * * *")
    protected scheduleExpr: string = "*/5 * * * * *";

    @Config("mail:crm:jobs:automations:batch", 100)
    protected batchSize: number = 100;

    @Config("mail:crm:jobs:automations:lease_seconds", 120)
    protected leaseSeconds: number = 120;

    @Config("mail:crm:jobs:automations:paused_retry_seconds", 60)
    protected pausedRetrySeconds: number = 60;

    private contactRoute?: BaseContactRoute;

    public get schedule(): string | undefined {
        return this.scheduleExpr;
    }

    public async run(): Promise<void> {
        const enrollments: RepoUtils<Enrollment> = await this.repo<Enrollment>("enrollment");
        const now: Date = new Date();
        const states = ModelUtils.literal([EnrollmentState.ACTIVE, EnrollmentState.WAITING], "in");
        const due: Enrollment[] = await enrollments.find(
            {
                $or: [
                    { state: states, nextRunAt: ModelUtils.literal(now, "lte"), leaseExpiresAt: ModelUtils.literal(null) },
                    { state: states, nextRunAt: ModelUtils.literal(now, "lte"), leaseExpiresAt: ModelUtils.literal(now, "lt") },
                ],
                sort: { nextRunAt: "ASC" },
            },
            { ignoreACL: true, limit: this.batchSize, skipCache: true },
        );
        const engine = new AutomationEngine({
            repos: this.repos(),
            classes: this.classes,
            contactRoute: async () => (this.contactRoute ??= await this._objectFactory!.newInstance(this.contactRouteClass, { name: "crm-automations" })),
            notificationUtils: this.notificationUtils,
            logger: this.logger,
        });
        const automations: Map<string, Promise<Automation | undefined>> = new Map();
        const versions: Map<string, Promise<AutomationVersion | undefined>> = new Map();
        for (const candidate of due) {
            try {
                const claimed: Enrollment = await enrollments.update(
                    { uid: candidate.uid, version: candidate.version, leaseExpiresAt: new Date(Date.now() + this.leaseSeconds * 1000) },
                    candidate,
                    { ignoreACL: true, skipPush: true },
                );
                const automation: Automation | undefined = await cached(automations, claimed.automationUid, () => this.findOne<Automation>("automation", claimed.automationUid));
                const version: AutomationVersion | undefined = await cached(versions, claimed.versionUid, () => this.findOne<AutomationVersion>("automationVersion", claimed.versionUid));
                let changes: Partial<Enrollment>;
                if (!automation || !version) {
                    changes = { state: EnrollmentState.EXITED, finishedAt: new Date(), error: "The automation was deleted.", waitFor: null as any };
                } else if (automation.status === AutomationStatus.PAUSED) {
                    changes = { nextRunAt: new Date(Date.now() + this.pausedRetrySeconds * 1000) };
                } else {
                    changes = await engine.advance(claimed, automation, version.graph as AutomationGraph);
                }
                await enrollments.update({ ...changes, leaseExpiresAt: null, uid: claimed.uid, version: claimed.version } as any, claimed, { ignoreACL: true, skipPush: true });
            } catch (err: any) {
                if (!/version/i.test(err?.message ?? "")) {
                    this.logger?.error(`AutomationRunJob: enrollment ${candidate.uid} failed: ${err?.message ?? err}`);
                }
            }
        }
    }

    private async findOne<T>(name: "automation" | "automationVersion", uid: string): Promise<T | undefined> {
        return await (await this.repo<T>(name)).findOne(uid, { ignoreACL: true, skipCache: true });
    }
}

/** `load()`'s result for `key`, loaded once per run. */
function cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
    let value: Promise<T> | undefined = cache.get(key);
    if (!value) {
        value = load();
        cache.set(key, value);
    }
    return value;
}
