///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils } from "@rapidrest/service-core";
import { CrmForm, CrmObjectType, FormField, PropertyDefinition, WorkspaceAction } from "../models/types.js";
import { MAX_LONG_TEXT, badRequest, isObject, readBoolean, readTags, readText } from "../util/Validation.js";
import { BaseWorkspaceRecordRoute, WriteContext } from "./BaseWorkspaceRecordRoute.js";

/** How many fields a form may have, and how many lists it may subscribe to. */
export const MAX_FORM_FIELDS = 30;
export const MAX_FORM_LISTS = 20;

/** The contact fields a form can ask for, besides custom properties (`properties.<key>`) - `company` is the company's name. */
export const FORM_TARGETS: readonly string[] = ["email", "firstName", "lastName", "phone", "jobTitle", "company"];

export const DEFAULT_SUCCESS_MESSAGE = "Thanks for signing up!";

/**
 * A workspace's signup forms (`/api/mail/crm/forms`) - see `BaseWorkspaceRecordRoute` for the endpoints. Changing forms takes `MANAGE`.
 * A form always asks for an email address; its other fields fill contact fields or contact custom properties. Anyone may submit an
 * enabled form through the public API (`BasePublicRoute`), at `<public_url>/f/<uid>`.
 */
export abstract class BaseFormRoute extends BaseWorkspaceRecordRoute<CrmForm> {
    protected readonly model = "form" as const;
    protected readonly pushType: string = "CrmForm";
    protected override readonly sortFields: readonly string[] = ["name"];
    protected override readonly writeAction: WorkspaceAction = WorkspaceAction.MANAGE;

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<CrmForm>> {
        const fields: Partial<CrmForm> = await this.readFields(body, context, undefined);
        fields.title ??= fields.name;
        fields.fields ??= [{ target: "email", label: "Email", required: true }];
        fields.successMessage ??= DEFAULT_SUCCESS_MESSAGE;
        return fields;
    }

    protected async readUpdate(body: Record<string, unknown>, existing: CrmForm, context: WriteContext): Promise<Partial<CrmForm>> {
        return await this.readFields(body, context, existing);
    }

    private async readFields(body: Record<string, unknown>, context: WriteContext, existing: CrmForm | undefined): Promise<Partial<CrmForm>> {
        const result: Record<string, unknown> = {};
        for (const [field, required, max] of [
            ["name", true, undefined],
            ["title", true, undefined],
            ["successMessage", true, MAX_LONG_TEXT],
            ["description", false, MAX_LONG_TEXT],
        ] as const) {
            const value: string | null | undefined = readText(body, field, { required: required && !existing && field === "name", max });
            if (value === null && required) {
                throw badRequest(`'${field}' is required.`);
            }
            if (value !== undefined) {
                result[field] = value;
            }
        }
        if (body.fields !== undefined) {
            result.fields = await this.readFormFields(body.fields, context.workspaceUid);
        }
        if (body.listUids !== undefined) {
            result.listUids = await this.readLists(body.listUids, context.workspaceUid);
        }
        for (const field of ["doubleOptIn", "enabled"]) {
            const value: boolean | undefined = readBoolean(body, field);
            if (value !== undefined) {
                result[field] = value;
            }
        }
        if (body.senderUid !== undefined) {
            result.senderUid = body.senderUid === null || body.senderUid === "" ? null : await this.requireSender(context.workspaceUid, body.senderUid);
        }
        if (body.redirectUrl !== undefined) {
            const url: string | null | undefined = readText(body, "redirectUrl", { max: 2048 });
            if (url && !/^https:\/\/[^\s/]+/i.test(url)) {
                throw badRequest("'redirectUrl' must be an https:// address.");
            }
            result.redirectUrl = url;
        }
        const tags: string[] | undefined = readTags(body);
        if (tags !== undefined) {
            result.tags = tags;
        }
        const doubleOptIn: boolean = (result.doubleOptIn as boolean | undefined) ?? existing?.doubleOptIn ?? true;
        const lists: string[] = (result.listUids as string[] | undefined) ?? existing?.listUids ?? [];
        const senderUid: unknown = "senderUid" in result ? result.senderUid : existing?.senderUid;
        if (doubleOptIn && lists.length > 0 && !senderUid) {
            throw badRequest("A form with double opt-in needs a 'senderUid' to send its confirmation emails from.");
        }
        return result;
    }

    /** A form's fields: each a known contact field or contact property, used once, with `email` among them. */
    private async readFormFields(raw: unknown, workspaceUid: string): Promise<FormField[]> {
        if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FORM_FIELDS) {
            throw badRequest(`'fields' must be a list of 1 to ${MAX_FORM_FIELDS} fields.`);
        }
        const definitions: PropertyDefinition[] = await (await this.repo<PropertyDefinition>("propertyDefinition")).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), objectType: ModelUtils.literal(CrmObjectType.CONTACT) },
            { ignoreACL: true, limit: 1000, skipCache: true },
        );
        const targets: string[] = [...FORM_TARGETS, ...definitions.map((definition) => `properties.${definition.key}`)];
        const fields: FormField[] = [];
        for (const entry of raw) {
            if (!isObject(entry) || typeof entry.target !== "string" || !targets.includes(entry.target)) {
                throw badRequest(`Each field's 'target' must be one of: ${targets.join(", ")}.`);
            }
            if (fields.some((field) => field.target === entry.target)) {
                throw badRequest(`The form asks for '${entry.target}' twice.`);
            }
            const label: string = readText(entry, "label", { required: true, max: 100 })!;
            fields.push({ target: entry.target, label, required: entry.target === "email" || entry.required === true });
        }
        if (!fields.some((field) => field.target === "email")) {
            throw badRequest("A form must ask for 'email'.");
        }
        return fields;
    }

    private async readLists(raw: unknown, workspaceUid: string): Promise<string[]> {
        if (!Array.isArray(raw) || raw.length > MAX_FORM_LISTS) {
            throw badRequest(`'listUids' must be a list of at most ${MAX_FORM_LISTS} lists.`);
        }
        const uids: string[] = [...new Set(raw)];
        for (const uid of uids) {
            if (!(await this.findList(workspaceUid, uid))) {
                throw badRequest("'listUids' must name lists of the workspace.");
            }
        }
        return uids;
    }
}
