///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { SavedBlock } from "../models/types.js";
import { badRequest, readText } from "../util/Validation.js";
import { BaseWorkspaceRecordRoute, WriteContext } from "./BaseWorkspaceRecordRoute.js";
import { readSavedBlocks } from "./BaseTemplateRoute.js";

/** How many saved blocks one workspace may have. */
export const MAX_SAVED_BLOCK_RECORDS = 500;

/**
 * Blocks saved for reuse in a workspace's templates (`/api/mail/crm/saved-blocks`) - see `BaseWorkspaceRecordRoute` for the endpoints.
 * The blocks are checked and sanitized like a template's; hand-written HTML only from a workspace admin.
 */
export abstract class BaseSavedBlockRoute extends BaseWorkspaceRecordRoute<SavedBlock> {
    protected readonly model = "savedBlock" as const;
    protected readonly pushType: string = "CrmSavedBlock";
    protected override readonly sortFields: readonly string[] = ["name"];
    protected override readonly maxRecords: number = MAX_SAVED_BLOCK_RECORDS;

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<SavedBlock>> {
        return {
            name: readText(body, "name", { required: true })!,
            blocks: readSavedBlocks(body.blocks, await this.canManage(context.user, context.workspaceUid)),
        };
    }

    protected async readUpdate(body: Record<string, unknown>, _existing: SavedBlock, context: WriteContext): Promise<Partial<SavedBlock>> {
        const fields: Partial<SavedBlock> = {};
        const name: string | null | undefined = readText(body, "name");
        if (name === null) {
            throw badRequest("'name' is required.");
        }
        if (name !== undefined) {
            fields.name = name;
        }
        if (body.blocks !== undefined) {
            fields.blocks = readSavedBlocks(body.blocks, await this.canManage(context.user, context.workspaceUid));
        }
        return fields;
    }
}
