///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import * as crypto from "crypto";
import { ModelUtils, RepoUtils } from "@rapidrest/service-core";
import type { CrmSetting } from "../models/types.js";

/** The `CrmSetting` key of the generated token key. */
export const TOKEN_SECRET_KEY = "token-secret";

/**
 * The generated key tokens and tracking links are signed with, kept as a `CrmSetting` so every server copy (routes and jobs alike)
 * signs and checks with the same key: read, or generated and saved on first use. Two copies generating one at once both read back
 * whichever was saved first (the key is unique).
 */
export async function readOrCreateTokenSecret(repo: RepoUtils<CrmSetting>, settingClass: any): Promise<string> {
    const find = async (): Promise<CrmSetting | undefined> =>
        (await repo.find({ key: ModelUtils.literal(TOKEN_SECRET_KEY) }, { ignoreACL: true, limit: 1, skipCache: true }))[0];
    let setting: CrmSetting | undefined = await find();
    if (!setting) {
        try {
            setting = await repo.create(new settingClass({ key: TOKEN_SECRET_KEY, value: crypto.randomBytes(32).toString("base64url") }), {
                ignoreACL: true,
                skipPush: true,
            });
        } catch {
            // Another copy saved one first: use theirs.
            setting = await find();
        }
    }
    return setting!.value;
}
