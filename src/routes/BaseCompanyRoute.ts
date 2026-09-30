///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils, RepoUtils } from "@rapidrest/service-core";
import { COMPANY_EXPORT_FIELDS, COMPANY_FIELDS } from "../filters/fields.js";
import { CrmCompany, CrmContact, CrmObjectType } from "../models/types.js";
import { badRequest, normalizeDomain, readNumber, readTags, readText } from "../util/Validation.js";
import { IMPORT_FIELDS } from "../util/ImportMapping.js";
import { BaseTaggedRecordRoute } from "./BaseTaggedRecordRoute.js";
import { WriteContext } from "./BaseWorkspaceRecordRoute.js";

/** How many companies one workspace may have. */
export const MAX_COMPANIES = 200000;

/**
 * A workspace's companies (`/api/mail/crm/companies`) - see `BaseWorkspaceRecordRoute` for the endpoints and `BaseTaggedRecordRoute`
 * for tags, custom properties, filters, bulk actions and export. A company's `domain` is normalized (`acme.com` from
 * `https://www.acme.com/about` or `jane@acme.com`); new contacts with an address at it are linked to it. Deleting a company unlinks
 * its contacts.
 */
export abstract class BaseCompanyRoute extends BaseTaggedRecordRoute<CrmCompany> {
    protected readonly model = "company" as const;
    protected readonly pushType: string = "CrmCompany";
    protected readonly objectType: CrmObjectType = CrmObjectType.COMPANY;
    protected readonly recordFields = COMPANY_FIELDS;
    protected readonly textFields: readonly string[] = ["name", "domain"];
    protected readonly exportFields: readonly string[] = COMPANY_EXPORT_FIELDS;
    protected readonly noun: string = "company";
    protected override readonly sortFields: readonly string[] = ["name", "domain", "employeeCount"];
    protected override readonly maxRecords: number = MAX_COMPANIES;
    public readonly importFields: Readonly<Record<string, "text" | "number">> = IMPORT_FIELDS[CrmObjectType.COMPANY];

    /** The workspace's company with the row's domain, or else (for a row with no domain) with its exact name. */
    protected async findExisting(workspaceUid: string, body: Record<string, unknown>): Promise<CrmCompany | undefined> {
        const domain: string | undefined = typeof body.domain === "string" ? normalizeDomain(body.domain) : undefined;
        const name: string | undefined = typeof body.name === "string" && body.name.trim().length > 0 ? body.name.trim() : undefined;
        if (!domain && !name) {
            return undefined;
        }
        const matches: CrmCompany[] = await (await this.records()).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), ...(domain ? { domain: ModelUtils.literal(domain) } : { name: ModelUtils.literal(name) }) },
            { ignoreACL: true, limit: 1, skipCache: true },
        );
        return matches[0];
    }

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<CrmCompany>> {
        await this.readPropertyWrites(body, context.workspaceUid);
        const fields: Partial<CrmCompany> = await this.readFields(body, context);
        if (!fields.name) {
            throw badRequest("'name' is required.");
        }
        return fields;
    }

    protected async readUpdate(body: Record<string, unknown>, _existing: CrmCompany, context: WriteContext): Promise<Partial<CrmCompany>> {
        await this.readPropertyWrites(body, context.workspaceUid);
        const fields: Partial<CrmCompany> = await this.readFields(body, context);
        if (fields.name === null) {
            throw badRequest("'name' is required.");
        }
        return fields;
    }

    private async readFields(body: Record<string, unknown>, context: WriteContext): Promise<Partial<CrmCompany>> {
        const fields: Record<string, unknown> = {};
        for (const field of ["name", "industry", "phone", "website", "city", "country"]) {
            const value: string | null | undefined = readText(body, field);
            if (value !== undefined) {
                fields[field] = value;
            }
        }
        const domain: string | null | undefined = readText(body, "domain");
        if (domain !== undefined) {
            const normalized: string | undefined = domain === null ? undefined : normalizeDomain(domain);
            if (domain !== null && !normalized) {
                throw badRequest("'domain' must be a web domain such as example.com.");
            }
            fields.domain = normalized ?? null;
        }
        const employeeCount: number | null | undefined = readNumber(body, "employeeCount", { integer: true, min: 0, max: 100000000 });
        if (employeeCount !== undefined) {
            fields.employeeCount = employeeCount;
        }
        const tags: string[] | undefined = readTags(body);
        if (tags !== undefined) {
            fields.tags = tags;
        }
        if (body.ownerUserUid !== undefined) {
            fields.ownerUserUid = await this.requireMemberUid(context.workspaceUid, readText(body, "ownerUserUid", { max: 128 }), "ownerUserUid");
        }
        return fields;
    }

    /** Deleting companies unlinks their contacts too. */
    protected override async deleteRelated(uids: string[], workspaceUid: string): Promise<void> {
        await super.deleteRelated(uids, workspaceUid);
        const contactRepo: RepoUtils<CrmContact> = await this.repo<CrmContact>("contact");
        for (;;) {
            const contacts: CrmContact[] = await contactRepo.find(
                { workspaceUid: ModelUtils.literal(workspaceUid), companyUid: ModelUtils.literal(uids, "in") },
                { ignoreACL: true, limit: 500, skipCache: true },
            );
            for (const contact of contacts) {
                await contactRepo.update({ uid: contact.uid, version: contact.version, companyUid: null } as any, new this.classes.contact(contact), {
                    ignoreACL: true,
                    skipPush: true,
                });
            }
            if (contacts.length < 500) {
                return;
            }
        }
    }
}
