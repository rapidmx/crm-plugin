///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { ModelUtils, RepoUtils } from "@rapidrest/service-core";
import { ScoringRule, Workspace } from "../models/types.js";
import { MAX_SCORING_RULES } from "../routes/BaseScoringRuleRoute.js";
import { scoreWorkspace } from "../scoring/Scoring.js";
import { CrmJobBase } from "./CrmJobBase.js";
const { Config } = ObjectDecorators;

/**
 * Keeps lead scores current (`scoreWorkspace()`): rescores a workspace soon after its scoring rules change (`scoringDirty`), and
 * every `mail:crm:jobs:scoring:interval_seconds` while it has rules, since activity rules count within moving windows. A workspace
 * is claimed by stamping `scoredAt` (version-checked); a rule changed while it is scored marks it dirty again for the next run.
 */
export abstract class ScoringJob extends CrmJobBase {
    @Config("mail:crm:jobs:scoring:schedule", "30 * * * * *")
    protected scheduleExpr: string = "30 * * * * *";

    @Config("mail:crm:jobs:scoring:interval_seconds", 3600)
    protected intervalSeconds: number = 3600;

    @Config("mail:crm:jobs:scoring:batch", 5)
    protected batchSize: number = 5;

    public get schedule(): string | undefined {
        return this.scheduleExpr;
    }

    public async run(): Promise<void> {
        const workspaces: RepoUtils<Workspace> = await this.repo<Workspace>("workspace");
        const stale: Date = new Date(Date.now() - this.intervalSeconds * 1000);
        const due: Workspace[] = await workspaces.find(
            {
                $or: [
                    { scoringDirty: ModelUtils.literal(true) },
                    { scoringRules: ModelUtils.literal(0, "gt"), scoredAt: ModelUtils.literal(null) },
                    { scoringRules: ModelUtils.literal(0, "gt"), scoredAt: ModelUtils.literal(stale, "lt") },
                ],
                sort: { dateModified: "ASC" },
            },
            { ignoreACL: true, limit: this.batchSize, skipCache: true },
        );
        for (const candidate of due) {
            try {
                await workspaces.update({ uid: candidate.uid, version: candidate.version, scoringDirty: false, scoredAt: new Date() }, candidate, {
                    ignoreACL: true,
                    skipPush: true,
                });
                const rules: ScoringRule[] = await (await this.repo<ScoringRule>("scoringRule")).find(
                    { workspaceUid: ModelUtils.literal(candidate.uid) },
                    { ignoreACL: true, limit: MAX_SCORING_RULES, skipCache: true },
                );
                await scoreWorkspace(this.repos(), candidate.uid, rules);
            } catch (err: any) {
                if (!/version/i.test(err?.message ?? "")) {
                    this.logger?.error(`ScoringJob: workspace ${candidate.uid} failed: ${err?.message ?? err}`);
                }
            }
        }
    }
}
