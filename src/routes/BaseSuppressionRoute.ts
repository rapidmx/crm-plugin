///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils } from "@rapidrest/service-core";
import { Suppression, SuppressionReason, WorkspaceAction } from "../models/types.js";
import { MAX_LONG_TEXT, badRequest, conflict, readEmail, readEnum, readText } from "../util/Validation.js";
import { BaseWorkspaceRecordRoute, WriteContext } from "./BaseWorkspaceRecordRoute.js";

/**
 * A workspace's suppression list (`/api/mail/crm/suppressions`) - see `BaseWorkspaceRecordRoute` for the endpoints: addresses no
 * campaign or automation ever mails, whatever lists they are on. Bounces and spam complaints add to it on their own (Phase 4); a
 * member with `MANAGE` adds and removes addresses by hand. `GET /:workspaceUid` takes `email` to look one address up. Only an
 * entry's note can change.
 */
export abstract class BaseSuppressionRoute extends BaseWorkspaceRecordRoute<Suppression> {
    protected readonly model = "suppression" as const;
    protected readonly pushType: string = "CrmSuppression";
    protected override readonly writeAction: WorkspaceAction = WorkspaceAction.MANAGE;
    protected override readonly sortFields: readonly string[] = ["email", "reason"];

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<Suppression>> {
        const email: string = readEmail(body, "email", { required: true })!;
        const existing: Suppression[] = await (await this.records()).find(
            { workspaceUid: ModelUtils.literal(context.workspaceUid), email: ModelUtils.literal(email) },
            { ignoreACL: true, limit: 1, skipCache: true },
        );
        if (existing.length > 0) {
            throw conflict(`${email} is already suppressed.`);
        }
        return {
            email,
            reason: readEnum(body, "reason", Object.values(SuppressionReason)) ?? SuppressionReason.MANUAL,
            note: readText(body, "note", { max: MAX_LONG_TEXT }) ?? undefined,
        };
    }

    protected async readUpdate(body: Record<string, unknown>, existing: Suppression): Promise<Partial<Suppression>> {
        if ((body.email !== undefined && body.email !== existing.email) || (body.reason !== undefined && body.reason !== existing.reason)) {
            throw badRequest("Only a suppression's note can change.");
        }
        const note: string | null | undefined = readText(body, "note", { max: MAX_LONG_TEXT });
        return note === undefined ? {} : { note: note as string };
    }

    protected override listQuery(query: Record<string, unknown>): Record<string, unknown> {
        return typeof query.email === "string" && query.email.length > 0 && query.email.length <= 254
            ? { email: ModelUtils.literal(query.email.trim().toLowerCase()) }
            : {};
    }
}
