///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils } from "@rapidrest/service-core";
import { COMPANY_FIELDS, CONTACT_FIELDS } from "../filters/fields.js";
import { CrmObjectType, PropertyDefinition, PropertyOption, PropertyType, WorkspaceAction } from "../models/types.js";
import { TAGS_KEY } from "../util/PropertyValues.js";
import { MAX_LONG_TEXT, badRequest, conflict, readEnum, readText } from "../util/Validation.js";
import { BaseWorkspaceRecordRoute, WriteContext } from "./BaseWorkspaceRecordRoute.js";

/** A property key: a lowercase letter, then lowercase letters, digits and underscores. */
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

/** How many options a select property may have, and how long one may be. */
export const MAX_OPTIONS = 200;
export const MAX_OPTION_LENGTH = 100;

/** How many custom properties one workspace may define. */
export const MAX_PROPERTY_DEFINITIONS = 500;

/** Keys a custom property may never have: the record's own fields and the names the API uses around them. */
const RESERVED_KEYS: ReadonlySet<string> = new Set([
    ...Object.keys(CONTACT_FIELDS),
    ...Object.keys(COMPANY_FIELDS),
    TAGS_KEY,
    "uid",
    "version",
    "properties",
    "workspaceuid",
]);

/**
 * A workspace's custom properties (`/api/mail/crm/properties`) - see `BaseWorkspaceRecordRoute` for the endpoints. Defining them takes
 * `MANAGE` (a workspace admin). A property's `objectType`, `key` and `type` are fixed once created; its label, options, group and
 * description can change. Deleting one deletes every value of it.
 */
export abstract class BasePropertyDefinitionRoute extends BaseWorkspaceRecordRoute<PropertyDefinition> {
    protected readonly model = "propertyDefinition" as const;
    protected readonly pushType: string = "CrmPropertyDefinition";
    protected override readonly writeAction: WorkspaceAction = WorkspaceAction.MANAGE;
    protected override readonly maxRecords: number = MAX_PROPERTY_DEFINITIONS;

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<PropertyDefinition>> {
        const objectType: CrmObjectType = readEnum(body, "objectType", Object.values(CrmObjectType), { required: true })!;
        const key: unknown = body.key;
        if (typeof key !== "string" || !KEY_PATTERN.test(key) || RESERVED_KEYS.has(key.toLowerCase())) {
            throw badRequest("'key' must be lowercase letters, digits and underscores starting with a letter, and not a built-in field.");
        }
        const type: PropertyType = readEnum(body, "type", Object.values(PropertyType), { required: true })!;
        const existing: PropertyDefinition[] = await (await this.records()).find(
            { workspaceUid: ModelUtils.literal(context.workspaceUid), objectType: ModelUtils.literal(objectType), key: ModelUtils.literal(key) },
            { ignoreACL: true, limit: 1, skipCache: true },
        );
        if (existing.length > 0) {
            throw conflict(`There is already a ${objectType} property '${key}'.`);
        }
        return {
            objectType,
            key,
            type,
            label: readText(body, "label", { required: true })!,
            options: this.readOptions(body, type, true) ?? [],
            group: readText(body, "group") ?? undefined,
            description: readText(body, "description", { max: MAX_LONG_TEXT }) ?? undefined,
        };
    }

    protected async readUpdate(body: Record<string, unknown>, existing: PropertyDefinition): Promise<Partial<PropertyDefinition>> {
        for (const field of ["objectType", "key", "type"] as const) {
            if (body[field] !== undefined && body[field] !== existing[field]) {
                throw badRequest(`A property's '${field}' can't change.`);
            }
        }
        const fields: Partial<PropertyDefinition> = {};
        const label: string | null | undefined = readText(body, "label");
        if (label === null) {
            throw badRequest("'label' is required.");
        }
        if (label !== undefined) {
            fields.label = label;
        }
        const options: PropertyOption[] | undefined = this.readOptions(body, existing.type, false);
        if (options !== undefined) {
            fields.options = options;
        }
        for (const [field, max] of [
            ["group", undefined],
            ["description", MAX_LONG_TEXT],
        ] as const) {
            const value: string | null | undefined = readText(body, field, { max });
            if (value !== undefined) {
                (fields as any)[field] = value;
            }
        }
        return fields;
    }

    /** The options of a select or multi-select property (required on create), each `{ value, label }` with unique values. */
    private readOptions(body: Record<string, unknown>, type: PropertyType, required: boolean): PropertyOption[] | undefined {
        const isSelect: boolean = type === PropertyType.SELECT || type === PropertyType.MULTI_SELECT;
        const raw: unknown = body.options;
        if (raw === undefined) {
            if (required && isSelect) {
                throw badRequest("A select property needs 'options'.");
            }
            return undefined;
        }
        if (!isSelect) {
            throw badRequest("Only a select or multi-select property has 'options'.");
        }
        if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_OPTIONS) {
            throw badRequest(`'options' must be a list of 1 to ${MAX_OPTIONS} options.`);
        }
        const options: PropertyOption[] = [];
        for (const entry of raw) {
            const value: unknown = typeof entry === "string" ? entry : entry?.value;
            const label: unknown = typeof entry === "string" ? entry : (entry?.label ?? entry?.value);
            if (
                typeof value !== "string" ||
                typeof label !== "string" ||
                value.trim().length === 0 ||
                value.length > MAX_OPTION_LENGTH ||
                label.trim().length === 0 ||
                label.length > MAX_OPTION_LENGTH
            ) {
                throw badRequest(`Each option must be { value, label } of 1 to ${MAX_OPTION_LENGTH} characters.`);
            }
            if (options.some((option) => option.value === value.trim())) {
                throw badRequest(`The option '${value.trim()}' is listed twice.`);
            }
            options.push({ value: value.trim(), label: label.trim() });
        }
        return options;
    }

    protected override async afterDelete(record: PropertyDefinition, context: WriteContext): Promise<void> {
        await (await this.repo("propertyValue")).truncate(
            {
                workspaceUid: ModelUtils.literal(context.workspaceUid),
                objectType: ModelUtils.literal(record.objectType),
                key: ModelUtils.literal(record.key),
            },
            { ignoreACL: true, skipPush: true },
        );
    }

    protected override listQuery(query: Record<string, unknown>): Record<string, unknown> {
        return Object.values(CrmObjectType).includes(query.objectType as CrmObjectType) ? { objectType: ModelUtils.literal(query.objectType) } : {};
    }
}
