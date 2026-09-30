///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { ModelUtils, RepoUtils } from "@rapidrest/service-core";
import { Segment, SegmentKind } from "../models/types.js";
import { SegmentRefresh, refreshSegment } from "../segments/Segments.js";
import { CrmJobBase } from "./CrmJobBase.js";
const { Config } = ObjectDecorators;

/**
 * Keeps dynamic segments current: every run refreshes (`refreshSegment()`) the segments last refreshed longer than
 * `mail:crm:jobs:segments:refresh_seconds` ago, oldest first. A segment is claimed by stamping its `refreshedAt` (version-checked), so
 * replicas share the work without refreshing one segment twice. `membersChanged()` is told who entered and left.
 */
export abstract class SegmentRefreshJob extends CrmJobBase {
    @Config("mail:crm:jobs:segments:schedule", "0 * * * * *")
    protected scheduleExpr: string = "0 * * * * *";

    @Config("mail:crm:jobs:segments:refresh_seconds", 300)
    protected refreshSeconds: number = 300;

    @Config("mail:crm:jobs:segments:batch", 20)
    protected batchSize: number = 20;

    public get schedule(): string | undefined {
        return this.scheduleExpr;
    }

    public async run(): Promise<void> {
        const repo: RepoUtils<Segment> = await this.repo<Segment>("segment");
        const stale: Date = new Date(Date.now() - this.refreshSeconds * 1000);
        const due: Segment[] = await repo.find(
            {
                $or: [
                    { kind: ModelUtils.literal(SegmentKind.DYNAMIC), refreshedAt: ModelUtils.literal(null) },
                    { kind: ModelUtils.literal(SegmentKind.DYNAMIC), refreshedAt: ModelUtils.literal(stale, "lt") },
                ],
                sort: { refreshedAt: "ASC" },
            },
            { ignoreACL: true, limit: this.batchSize, skipCache: true },
        );
        for (const candidate of due) {
            try {
                const claimed: Segment = await repo.update({ uid: candidate.uid, version: candidate.version, refreshedAt: new Date() }, candidate, {
                    ignoreACL: true,
                    skipPush: true,
                });
                const refresh: SegmentRefresh = await refreshSegment(this.repos(), this.classes, claimed);
                const saved: Segment = await repo.update({ ...refresh.counts, uid: claimed.uid, version: claimed.version }, claimed, {
                    ignoreACL: true,
                    skipPush: true,
                });
                this.notify(saved.workspaceUid, "CrmSegment", saved);
                await this.membersChanged(saved, refresh.entered, refresh.left);
            } catch (err: any) {
                // A version conflict is another replica, or a member, getting there first.
                if (!/version/i.test(err?.message ?? "")) {
                    this.logger?.error(`SegmentRefreshJob: segment ${candidate.uid} failed: ${err?.message ?? err}`);
                }
            }
        }
    }

    /** Who entered and left a segment in a refresh - where automations hook in. */
    protected async membersChanged(_segment: Segment, _entered: string[], _left: string[]): Promise<void> {
        // Nothing yet.
    }
}
