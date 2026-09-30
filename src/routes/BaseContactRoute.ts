///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils } from "@rapidrest/service-core";
import { CONTACT_EXPORT_FIELDS, CONTACT_FIELDS } from "../filters/fields.js";
import { CrmCompany, CrmContact, CrmObjectType, EmailStatus, LifecycleStage } from "../models/types.js";
import { badRequest, conflict, normalizeDomain, readEmail, readEnum, readNumber, readTags, readText } from "../util/Validation.js";
import { IMPORT_FIELDS } from "../util/ImportMapping.js";
import { BaseTaggedRecordRoute } from "./BaseTaggedRecordRoute.js";
import { WriteContext } from "./BaseWorkspaceRecordRoute.js";

/** How many contacts one workspace may have. */
export const MAX_CONTACTS = 1000000;

/**
 * A workspace's contacts (`/api/mail/crm/contacts`) - see `BaseWorkspaceRecordRoute` for the endpoints and `BaseTaggedRecordRoute`
 * for tags, custom properties, filters, bulk actions and export.
 *
 * A contact is unique by email address within its workspace (409 on a duplicate). A new contact given no company is linked to the
 * workspace's company whose `domain` matches its email address, when there is one. Deleting a contact erases what the CRM holds
 * about the person (its values, notes and timeline).
 */
export abstract class BaseContactRoute extends BaseTaggedRecordRoute<CrmContact> {
    protected readonly model = "contact" as const;
    protected readonly pushType: string = "CrmContact";
    protected readonly objectType: CrmObjectType = CrmObjectType.CONTACT;
    protected readonly recordFields = CONTACT_FIELDS;
    protected readonly textFields: readonly string[] = ["email", "firstName", "lastName"];
    protected readonly exportFields: readonly string[] = CONTACT_EXPORT_FIELDS;
    protected readonly noun: string = "contact";
    protected override readonly sortFields: readonly string[] = ["email", "firstName", "lastName", "score", "lifecycleStage", "lastEngagedAt"];
    protected override readonly maxRecords: number = MAX_CONTACTS;
    public readonly importFields: Readonly<Record<string, "text" | "number">> = IMPORT_FIELDS[CrmObjectType.CONTACT];

    protected async findExisting(workspaceUid: string, body: Record<string, unknown>): Promise<CrmContact | undefined> {
        const email: unknown = body.email;
        if (typeof email !== "string" || email.trim().length === 0) {
            return undefined;
        }
        const matches: CrmContact[] = await (await this.records()).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), email: ModelUtils.literal(email.trim().toLowerCase()) },
            { ignoreACL: true, limit: 1, skipCache: true },
        );
        return matches[0];
    }

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<CrmContact>> {
        await this.readPropertyWrites(body, context.workspaceUid);
        const fields: Partial<CrmContact> = await this.readFields(body, context, undefined);
        fields.email = readEmail(body, "email", { required: true })!;
        await this.requireUniqueEmail(context.workspaceUid, fields.email, undefined);
        fields.source ??= "manual";
        if (fields.companyUid === undefined) {
            fields.companyUid = await this.companyForEmail(context.workspaceUid, fields.email);
        }
        return fields;
    }

    protected async readUpdate(body: Record<string, unknown>, existing: CrmContact, context: WriteContext): Promise<Partial<CrmContact>> {
        await this.readPropertyWrites(body, context.workspaceUid);
        const fields: Partial<CrmContact> = await this.readFields(body, context, existing);
        const email: string | null | undefined = readEmail(body, "email");
        if (email === null) {
            throw badRequest("'email' is required.");
        }
        if (email !== undefined && email !== existing.email) {
            await this.requireUniqueEmail(context.workspaceUid, email, existing.uid);
            fields.email = email;
        }
        return fields;
    }

    /** Every field but `email`, as given (`undefined` when absent, `null` to clear). */
    private async readFields(body: Record<string, unknown>, context: WriteContext, _existing: CrmContact | undefined): Promise<Partial<CrmContact>> {
        const fields: Record<string, unknown> = {};
        for (const field of ["firstName", "lastName", "phone", "jobTitle", "leadStatus", "source"]) {
            const value: string | null | undefined = readText(body, field);
            if (value !== undefined) {
                fields[field] = value;
            }
        }
        const lifecycleStage = readEnum(body, "lifecycleStage", Object.values(LifecycleStage));
        if (lifecycleStage) {
            fields.lifecycleStage = lifecycleStage;
        }
        const emailStatus = readEnum(body, "emailStatus", Object.values(EmailStatus));
        if (emailStatus) {
            fields.emailStatus = emailStatus;
        }
        const score: number | null | undefined = readNumber(body, "score", { integer: true, min: -1000000, max: 1000000 });
        if (score !== undefined) {
            fields.score = score ?? 0;
        }
        const tags: string[] | undefined = readTags(body);
        if (tags !== undefined) {
            fields.tags = tags;
        }
        if (body.ownerUserUid !== undefined) {
            fields.ownerUserUid = await this.requireMemberUid(context.workspaceUid, readText(body, "ownerUserUid", { max: 128 }), "ownerUserUid");
        }
        if (body.companyUid !== undefined) {
            const companyUid: string | null | undefined = readText(body, "companyUid", { max: 64 });
            if (companyUid) {
                const company: CrmCompany | undefined = await (await this.repo<CrmCompany>("company")).findOne(companyUid, { ignoreACL: true });
                if (!company || company.workspaceUid !== context.workspaceUid) {
                    throw badRequest("'companyUid' must be a company of the workspace.");
                }
            }
            fields.companyUid = companyUid;
        }
        return fields;
    }

    /** Refuses (409) an email address another contact of the workspace already has. */
    private async requireUniqueEmail(workspaceUid: string, email: string, exceptUid: string | undefined): Promise<void> {
        const matches: CrmContact[] = await (await this.records()).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), email: ModelUtils.literal(email) },
            { ignoreACL: true, limit: 2, skipCache: true },
        );
        if (matches.some((match) => match.uid !== exceptUid)) {
            throw conflict(`There is already a contact with the address ${email}.`);
        }
    }

    /** The uid of the workspace's company whose domain is `email`'s, when exactly one has it. */
    private async companyForEmail(workspaceUid: string, email: string): Promise<string | undefined> {
        const domain: string | undefined = normalizeDomain(email);
        if (!domain) {
            return undefined;
        }
        const companies: CrmCompany[] = await (await this.repo<CrmCompany>("company")).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), domain: ModelUtils.literal(domain) },
            { ignoreACL: true, limit: 2, skipCache: true },
        );
        return companies.length === 1 ? companies[0].uid : undefined;
    }

    /**
     * Deleting contacts deletes their subscriptions (their `lists` values go with the rest of their values), and the messages sent to
     * them and what came of those - nothing personal stays behind in campaign statistics.
     */
    protected override async deleteRelated(uids: string[], workspaceUid: string): Promise<void> {
        await super.deleteRelated(uids, workspaceUid);
        if (uids.length > 0) {
            for (const name of ["subscription", "outboundSend", "engagementEvent"] as const) {
                await (await this.repo(name)).truncate(
                    { workspaceUid: ModelUtils.literal(workspaceUid), contactUid: ModelUtils.literal(uids, "in") },
                    { ignoreACL: true, skipPush: true },
                );
            }
        }
    }

    protected override listQuery(query: Record<string, unknown>): Record<string, unknown> {
        return typeof query.companyUid === "string" && query.companyUid.length > 0 && query.companyUid.length <= 64
            ? { companyUid: ModelUtils.literal(query.companyUid) }
            : {};
    }
}
