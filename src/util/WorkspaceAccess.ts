///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ApiError, type JWTUser } from "@rapidrest/core";
import { type ACLRecord, ACLUtils, ApiErrorMessages, ApiErrors } from "@rapidrest/service-core";
import { stripTrustedRoles } from "@rapidmx/restapi";
import { WorkspaceAction, WorkspaceRole } from "../models/types.js";

/** The actions each role is granted on its workspace's `AccessControlList`. An owner holds `FULL` (`*`), which includes them all. */
export const ROLE_ACTIONS: Readonly<Record<WorkspaceRole, readonly string[]>> = {
    [WorkspaceRole.OWNER]: ["*"],
    [WorkspaceRole.ADMIN]: [WorkspaceAction.READ, WorkspaceAction.WRITE, WorkspaceAction.MANAGE],
    [WorkspaceRole.EDITOR]: [WorkspaceAction.READ, WorkspaceAction.WRITE],
    [WorkspaceRole.VIEWER]: [WorkspaceAction.READ],
};

/** The roles from the most to the least privileged. */
export const ROLE_ORDER: readonly WorkspaceRole[] = [WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER];

/** Whether `value` is a `WorkspaceRole`. */
export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
    return typeof value === "string" && (ROLE_ORDER as readonly string[]).includes(value);
}

/** The ACL record granting `userUid` the actions of `role`. */
export function memberRecord(userUid: string, role: WorkspaceRole): ACLRecord {
    return { userOrRoleId: userUid, actions: [...ROLE_ACTIONS[role]] };
}

/**
 * Rejects a caller who doesn't hold `action` on the workspace with a 404 - the same answer a workspace that doesn't exist gets, so a
 * stranger can't tell which workspace uids are real. A member who can read the workspace but not do `action` gets a 403.
 *
 * Trusted roles are stripped first (`stripTrustedRoles()`): `ACLUtils.hasPermission()` answers `true` for an administrator on
 * anything, and a deployment administrator has no business in a workspace they aren't a member of - the same rule restapi applies to
 * mailboxes.
 */
export async function assertWorkspaceAccess(
    aclUtils: ACLUtils,
    trustedRoles: readonly string[],
    user: JWTUser | undefined,
    workspaceUid: string,
    action: WorkspaceAction,
): Promise<void> {
    const caller: JWTUser | undefined = stripTrustedRoles(user, trustedRoles);
    if (!caller?.uid || typeof workspaceUid !== "string" || workspaceUid.length === 0 || workspaceUid.length > 64) {
        throw notFound();
    }
    if (await aclUtils.hasPermission(caller, workspaceUid, action)) {
        return;
    }
    if (action !== WorkspaceAction.READ && (await aclUtils.hasPermission(caller, workspaceUid, WorkspaceAction.READ))) {
        throw new ApiError(ApiErrors.AUTH_PERMISSION_FAILURE, 403, ApiErrorMessages.AUTH_PERMISSION_FAILURE);
    }
    throw notFound();
}

/** A 404 `ApiError`. */
export function notFound(): ApiError {
    return new ApiError(ApiErrors.NOT_FOUND, 404, ApiErrorMessages.NOT_FOUND);
}
