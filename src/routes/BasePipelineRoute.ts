///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import * as crypto from "crypto";
import { ModelUtils, RepoUtils } from "@rapidrest/service-core";
import type { JWTUser } from "@rapidrest/core";
import { Deal, Pipeline, PipelineStage, StageKind, WorkspaceAction } from "../models/types.js";
import { badRequest, isObject, readBoolean, readText } from "../util/Validation.js";
import { BaseWorkspaceRecordRoute, WriteContext } from "./BaseWorkspaceRecordRoute.js";

/** How many pipelines one workspace may have, and stages one pipeline. */
export const MAX_PIPELINES = 20;
export const MAX_STAGES = 20;

/** The stages a workspace's first pipeline starts with. */
export function defaultStages(): PipelineStage[] {
    const stage = (name: string, probability: number, kind: StageKind = StageKind.OPEN): PipelineStage => ({ id: crypto.randomUUID(), name, probability, kind });
    return [
        stage("Qualified", 10),
        stage("Meeting booked", 30),
        stage("Proposal sent", 60),
        stage("Negotiation", 80),
        stage("Won", 100, StageKind.WON),
        stage("Lost", 0, StageKind.LOST),
    ];
}

/**
 * A workspace's sales pipelines (`/api/mail/crm/pipelines`) - see `BaseWorkspaceRecordRoute` for the endpoints; changing them takes
 * `MANAGE`. A workspace with none gets a default one ("Sales") the first time its pipelines are listed.
 *
 * A pipeline's `stages` are replaced as a whole: each keeps its `id` (a new one gets one), and a stage that still holds deals can't be
 * removed. A pipeline needs a won and a lost stage, and one that holds deals can't be deleted. One pipeline is the default.
 */
export abstract class BasePipelineRoute extends BaseWorkspaceRecordRoute<Pipeline> {
    protected readonly model = "pipeline" as const;
    protected readonly pushType: string = "CrmPipeline";
    protected override readonly writeAction: WorkspaceAction = WorkspaceAction.MANAGE;
    protected override readonly sortFields: readonly string[] = ["name"];
    protected override readonly maxRecords: number = MAX_PIPELINES;

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<Pipeline>> {
        const count: number = await (await this.records()).count({ workspaceUid: ModelUtils.literal(context.workspaceUid) }, { ignoreACL: true, skipCache: true });
        return {
            name: readText(body, "name", { required: true })!,
            stages: body.stages === undefined ? defaultStages() : this.readStages(body.stages, []),
            isDefault: count === 0 || readBoolean(body, "isDefault") === true,
        };
    }

    protected async readUpdate(body: Record<string, unknown>, existing: Pipeline): Promise<Partial<Pipeline>> {
        const fields: Record<string, unknown> = {};
        const name: string | null | undefined = readText(body, "name");
        if (name === null) {
            throw badRequest("'name' is required.");
        }
        if (name !== undefined) {
            fields.name = name;
        }
        if (body.stages !== undefined) {
            const stages: PipelineStage[] = this.readStages(body.stages, existing.stages);
            for (const removed of existing.stages.filter((stage) => !stages.some((entry) => entry.id === stage.id))) {
                const count: number = await (await this.repo<Deal>("deal")).count(
                    { pipelineUid: ModelUtils.literal(existing.uid), stageId: ModelUtils.literal(removed.id) },
                    { ignoreACL: true, skipCache: true },
                );
                if (count > 0) {
                    throw badRequest(`The stage "${removed.name}" still has ${count} deals: move them first.`);
                }
            }
            fields.stages = stages;
        }
        if (readBoolean(body, "isDefault") === true) {
            fields.isDefault = true;
        }
        return fields;
    }

    /** `raw` as a pipeline's stages: known ids kept, new ones given one; a won and a lost stage required. */
    private readStages(raw: unknown, current: PipelineStage[]): PipelineStage[] {
        if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_STAGES) {
            throw badRequest(`'stages' must be a list of 2 to ${MAX_STAGES} stages.`);
        }
        const ids: Set<string> = new Set();
        const stages: PipelineStage[] = (raw as unknown[]).map((entry, index) => {
            const where: string = `Stage ${index + 1}`;
            if (!isObject(entry)) {
                throw badRequest(`${where} must be an object.`);
            }
            const known: boolean = typeof entry.id === "string" && current.some((stage) => stage.id === entry.id);
            const id: string = known ? (entry.id as string) : crypto.randomUUID();
            if (ids.has(id)) {
                throw badRequest(`${where} repeats another stage.`);
            }
            ids.add(id);
            const kind: unknown = entry.kind ?? StageKind.OPEN;
            if (!Object.values(StageKind).includes(kind as StageKind)) {
                throw badRequest(`${where}'s kind must be open, won or lost.`);
            }
            const probability: unknown = entry.probability ?? (kind === StageKind.WON ? 100 : kind === StageKind.LOST ? 0 : 50);
            if (typeof probability !== "number" || !Number.isInteger(probability) || probability < 0 || probability > 100) {
                throw badRequest(`${where}'s probability must be a whole number from 0 to 100.`);
            }
            const rottingDays: unknown = entry.rottingDays;
            if (rottingDays !== undefined && rottingDays !== null && (typeof rottingDays !== "number" || !Number.isInteger(rottingDays) || rottingDays < 1 || rottingDays > 365)) {
                throw badRequest(`${where}'s rotting days must be a whole number from 1 to 365.`);
            }
            return {
                id,
                name: readText(entry, "name", { required: true, max: 100 })!,
                probability,
                kind: kind as StageKind,
                ...(typeof rottingDays === "number" ? { rottingDays } : {}),
            };
        });
        if (!stages.some((stage) => stage.kind === StageKind.WON) || !stages.some((stage) => stage.kind === StageKind.LOST)) {
            throw badRequest("A pipeline needs a won stage and a lost stage.");
        }
        if (!stages.some((stage) => stage.kind === StageKind.OPEN)) {
            throw badRequest("A pipeline needs at least one open stage.");
        }
        return stages;
    }

    /** A new default takes over from the old one. */
    protected override async afterWrite(record: Pipeline): Promise<void> {
        if (!record.isDefault) {
            return;
        }
        const repo: RepoUtils<Pipeline> = await this.records();
        for (const other of await repo.find(
            { workspaceUid: ModelUtils.literal(record.workspaceUid), isDefault: ModelUtils.literal(true) },
            { ignoreACL: true, limit: MAX_PIPELINES, skipCache: true },
        )) {
            if (other.uid !== record.uid) {
                await repo.update({ uid: other.uid, version: other.version, isDefault: false }, other, { ignoreACL: true, skipPush: true });
            }
        }
    }

    protected override async beforeDelete(record: Pipeline): Promise<void> {
        const count: number = await (await this.repo<Deal>("deal")).count({ pipelineUid: ModelUtils.literal(record.uid) }, { ignoreACL: true, skipCache: true });
        if (count > 0) {
            throw badRequest(`The pipeline still has ${count} deals: move or delete them first.`);
        }
        if (record.isDefault) {
            throw badRequest("Make another pipeline the default before deleting this one.");
        }
    }

    /** A workspace's pipelines, making it a default one ("Sales") if it has none. */
    public override async list(workspaceUid: string, query: Record<string, unknown> | undefined, user?: JWTUser): Promise<Pipeline[]> {
        const pipelines: Pipeline[] = await super.list(workspaceUid, query, user);
        if (pipelines.length > 0 || (query?.page !== undefined && query.page !== "0")) {
            return pipelines;
        }
        const created: Pipeline = await (await this.records()).create(
            new this.classes.pipeline({ workspaceUid, name: "Sales", stages: defaultStages(), isDefault: true }),
            { ignoreACL: true, skipPush: true },
        );
        return [JSON.parse(JSON.stringify(created))];
    }
}
