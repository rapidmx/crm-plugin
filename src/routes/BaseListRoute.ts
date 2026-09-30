///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils, RepoUtils } from "@rapidrest/service-core";
import { MailingList, SubscriptionStatus, WorkspaceAction } from "../models/types.js";
import { MAX_LONG_TEXT, badRequest, readBoolean, readText } from "../util/Validation.js";
import { BaseWorkspaceRecordRoute, WriteContext } from "./BaseWorkspaceRecordRoute.js";
import { LISTS_KEY } from "./CrmRouteBase.js";

/** How many lists one workspace may have. */
export const MAX_LISTS = 500;

/** A list as the API shows it: the list, and how many contacts are subscribed to it and waiting to confirm. */
export interface MailingListView extends MailingList {
    subscribedCount: number;
    pendingCount: number;
}

/**
 * A workspace's mailing lists (`/api/mail/crm/lists`) - see `BaseWorkspaceRecordRoute` for the endpoints. Creating, changing and
 * deleting a list takes `MANAGE`. A list with double opt-in needs a sender for its confirmation emails. Deleting a list deletes its
 * subscriptions.
 */
export abstract class BaseListRoute extends BaseWorkspaceRecordRoute<MailingList, MailingListView> {
    protected readonly model = "mailingList" as const;
    protected readonly pushType: string = "CrmMailingList";
    protected override readonly writeAction: WorkspaceAction = WorkspaceAction.MANAGE;
    protected override readonly sortFields: readonly string[] = ["name"];
    protected override readonly maxRecords: number = MAX_LISTS;

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<MailingList>> {
        const fields: Partial<MailingList> = await this.readFields(body, context, undefined);
        fields.publicName ??= fields.name;
        return fields;
    }

    protected async readUpdate(body: Record<string, unknown>, existing: MailingList, context: WriteContext): Promise<Partial<MailingList>> {
        return await this.readFields(body, context, existing);
    }

    private async readFields(body: Record<string, unknown>, context: WriteContext, existing: MailingList | undefined): Promise<Partial<MailingList>> {
        const fields: Record<string, unknown> = {};
        const name: string | null | undefined = readText(body, "name", { required: !existing });
        if (name === null) {
            throw badRequest("'name' is required.");
        }
        if (name !== undefined) {
            fields.name = name;
        }
        const publicName: string | null | undefined = readText(body, "publicName");
        if (publicName !== undefined) {
            // Cleared: subscribers see the list's own name.
            fields.publicName = publicName ?? name ?? existing?.name;
        }
        for (const field of ["description", "publicDescription"]) {
            const value: string | null | undefined = readText(body, field, { max: MAX_LONG_TEXT });
            if (value !== undefined) {
                fields[field] = value;
            }
        }
        for (const field of ["doubleOptIn", "visible"]) {
            const value: boolean | undefined = readBoolean(body, field);
            if (value !== undefined) {
                fields[field] = value;
            }
        }
        if (body.senderUid !== undefined) {
            fields.senderUid = body.senderUid === null || body.senderUid === "" ? null : await this.requireSender(context.workspaceUid, body.senderUid);
        }
        const doubleOptIn: boolean = (fields.doubleOptIn as boolean | undefined) ?? existing?.doubleOptIn ?? false;
        const senderUid: unknown = "senderUid" in fields ? fields.senderUid : existing?.senderUid;
        if (doubleOptIn && !senderUid) {
            throw badRequest("A list with double opt-in needs a 'senderUid' to send its confirmation emails from.");
        }
        return fields;
    }

    protected override async toViews(records: MailingList[]): Promise<MailingListView[]> {
        const repo: RepoUtils<any> = await this.repo("subscription");
        const views: MailingListView[] = [];
        for (const record of records) {
            const count = async (status: SubscriptionStatus): Promise<number> =>
                await repo.count({ listUid: ModelUtils.literal(record.uid), status: ModelUtils.literal(status) }, { ignoreACL: true, skipCache: true });
            views.push({
                ...JSON.parse(JSON.stringify(record)),
                subscribedCount: await count(SubscriptionStatus.SUBSCRIBED),
                pendingCount: await count(SubscriptionStatus.PENDING),
            });
        }
        return views;
    }

    protected override async afterDelete(record: MailingList, context: WriteContext): Promise<void> {
        const scope = { workspaceUid: ModelUtils.literal(context.workspaceUid) };
        await (await this.repo("subscription")).truncate({ ...scope, listUid: ModelUtils.literal(record.uid) }, { ignoreACL: true, skipPush: true });
        await (await this.repo("propertyValue")).truncate(
            { ...scope, key: ModelUtils.literal(LISTS_KEY), stringValue: ModelUtils.literal(record.uid) },
            { ignoreACL: true, skipPush: true },
        );
    }
}
