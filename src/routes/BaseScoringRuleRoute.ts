///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils, RepoUtils, RouteDecorators } from "@rapidrest/service-core";
import type { JWTUser } from "@rapidrest/core";
import { ScoringActivity, ScoringKind, ScoringRule, Workspace, WorkspaceAction } from "../models/types.js";
import { scoreWorkspace } from "../scoring/Scoring.js";
import { readSegmentFilter } from "../segments/Segments.js";
import { badRequest, readBoolean, readEnum, readNumber, readText } from "../util/Validation.js";
import { BaseWorkspaceRecordRoute, WriteContext } from "./BaseWorkspaceRecordRoute.js";
const { Param, Post, User: AuthUser } = RouteDecorators;

/** How many scoring rules one workspace may have. */
export const MAX_SCORING_RULES = 50;

/** How often the workspace's bookkeeping is retried when another write to it got there first. */
const WORKSPACE_ATTEMPTS = 5;

/**
 * A workspace's lead scoring rules (`/api/mail/crm/scoring-rules`) - see `BaseWorkspaceRecordRoute` for the endpoints; changing them
 * takes `MANAGE` - plus `POST /:workspaceUid/recalculate`, which scores every contact now (`{ changed }`).
 *
 * A contact's `score` is the sum of the enabled rules' points: a **property** rule gives its points to the contacts its filter matches
 * (the same filters as segments, but not naming segments), an **activity** rule gives its points for each time a contact did something
 * - opened, clicked, replied, bounced, submitted a form, subscribed, unsubscribed - in its last `withinDays`, up to `maxPoints`.
 * `ScoringJob` rescores a workspace soon after its rules change, and regularly after that (activity windows move).
 */
export abstract class BaseScoringRuleRoute extends BaseWorkspaceRecordRoute<ScoringRule> {
    protected readonly model = "scoringRule" as const;
    protected readonly pushType: string = "CrmScoringRule";
    protected override readonly writeAction: WorkspaceAction = WorkspaceAction.MANAGE;
    protected override readonly sortFields: readonly string[] = ["name"];
    protected override readonly maxRecords: number = MAX_SCORING_RULES;

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<ScoringRule>> {
        const kind: ScoringKind = readEnum(body, "kind", Object.values(ScoringKind), { required: true })!;
        return {
            name: readText(body, "name", { required: true })!,
            enabled: readBoolean(body, "enabled") ?? true,
            kind,
            ...(await this.readRule(kind, body, context.workspaceUid, true)),
        };
    }

    protected async readUpdate(body: Record<string, unknown>, existing: ScoringRule, context: WriteContext): Promise<Partial<ScoringRule>> {
        if (body.kind !== undefined && body.kind !== existing.kind) {
            throw badRequest("A rule's kind can't change; make a new rule.");
        }
        const fields: Record<string, unknown> = await this.readRule(existing.kind, body, context.workspaceUid, false);
        const name: string | null | undefined = readText(body, "name");
        if (name === null) {
            throw badRequest("'name' is required.");
        }
        if (name !== undefined) {
            fields.name = name;
        }
        const enabled: boolean | undefined = readBoolean(body, "enabled");
        if (enabled !== undefined) {
            fields.enabled = enabled;
        }
        return fields;
    }

    /** The fields of a rule of `kind` in `body`: all of them when `creating`, else those given. */
    private async readRule(kind: ScoringKind, body: Record<string, unknown>, workspaceUid: string, creating: boolean): Promise<Record<string, unknown>> {
        const fields: Record<string, unknown> = {};
        const points: number | null | undefined = readNumber(body, "points", { integer: true, min: -100, max: 100 });
        if (points === null || (creating && points === undefined)) {
            throw badRequest("'points' is required.");
        }
        if (points !== undefined) {
            fields.points = points;
        }
        if (kind === ScoringKind.PROPERTY) {
            if (creating || body.filter !== undefined) {
                fields.filter = await readSegmentFilter(this.repos(), workspaceUid, body.filter);
            }
            return fields;
        }
        const activity = readEnum(body, "activity", Object.values(ScoringActivity), { required: creating });
        if (activity) {
            fields.activity = activity;
        }
        for (const [field, max] of [
            ["maxPoints", 10_000],
            ["withinDays", 3650],
        ] as const) {
            const value: number | null | undefined = readNumber(body, field, { integer: true, min: 1, max });
            if (value !== undefined) {
                fields[field] = value;
            }
        }
        return fields;
    }

    protected override async afterWrite(record: ScoringRule): Promise<void> {
        await this.touchWorkspace(record.workspaceUid);
    }

    protected override async afterDelete(record: ScoringRule): Promise<void> {
        await this.touchWorkspace(record.workspaceUid);
    }

    /** Marks the workspace's scores out of date and counts its rules, so `ScoringJob` rescores it (and to 0, with none left). */
    private async touchWorkspace(workspaceUid: string): Promise<void> {
        const scoringRules: number = await (await this.records()).count({ workspaceUid: ModelUtils.literal(workspaceUid) }, { ignoreACL: true, skipCache: true });
        await this.updateWorkspace(workspaceUid, { scoringRules, scoringDirty: true });
    }

    private async updateWorkspace(workspaceUid: string, changes: Partial<Workspace>): Promise<void> {
        const repo: RepoUtils<Workspace> = await this.repo<Workspace>("workspace");
        for (let attempt = 1; ; attempt++) {
            const workspace: Workspace = await this.requireWorkspaceRecord(workspaceUid);
            try {
                await repo.update({ ...changes, uid: workspace.uid, version: workspace.version }, workspace, { ignoreACL: true, skipPush: true });
                return;
            } catch (err: any) {
                if (attempt >= WORKSPACE_ATTEMPTS || !/version/i.test(err?.message ?? "")) {
                    throw err;
                }
            }
        }
    }

    @Post("/:workspaceUid/recalculate")
    public async recalculate(@Param("workspaceUid") workspaceUid: string, @AuthUser user?: JWTUser): Promise<{ changed: number }> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.MANAGE);
        const rules: ScoringRule[] = await (await this.records()).find({ workspaceUid: ModelUtils.literal(workspaceUid) }, { ignoreACL: true, limit: MAX_SCORING_RULES, skipCache: true });
        const changed: number = await scoreWorkspace(this.repos(), workspaceUid, rules);
        await this.updateWorkspace(workspaceUid, { scoringDirty: false, scoredAt: new Date() });
        return { changed };
    }
}
