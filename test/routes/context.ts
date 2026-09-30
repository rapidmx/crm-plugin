///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// What every route suite gets from the Mongo and SQL harnesses (`test/routes/{mongo,sql}/crm.test.ts`), and a small request helper.
import { request } from "@rapidrest/service-core/test";
import type { InMemoryBlobStore, RecordingMailTransport } from "../testDoubles.js";

export interface TestUser {
    uid: string;
    token: string;
}

export interface CrmTestContext {
    app: () => any;
    /** Where the test server mounts the routes: `/mongo/crm` or `/sql/crm`. */
    prefix: string;
    /** Users with no roles, and one with the trusted `admin` role. None is a member of anything until a test makes them one. */
    users: { owner: TestUser; editor: TestUser; viewer: TestUser; stranger: TestUser; admin: TestUser };
    /** A mailbox owned by `ownerUid` (full access), with `address` as its primary address and uid. */
    createMailbox: (ownerUid: string, address: string, grants?: { userOrRoleId: string; actions: string[] }[]) => Promise<{ uid: string }>;
    blobStore: () => InMemoryBlobStore;
    /** A new `CrmImportJob` of the harness's backend. */
    importJob: () => Promise<any>;
    /** A new `CampaignJob`, `SendDispatchJob` or `CrmMailEventJob` of the harness's backend. */
    job: (name: "campaign" | "send" | "events" | "segments" | "scoring" | "triggers" | "automations") => Promise<any>;
    /** The `RepoUtils` of one of `CrmModelClasses`' models, for looking behind the API. */
    repo: (name: string) => Promise<any>;
    /** Every message pushed with `NotificationUtils.sendMessage()` since the last `clearPushed()`. */
    pushed: () => { uids: string[]; type: string; action: string; data: any }[];
    /** The mounted instance of a test route (`ContactRoute`, `WorkspaceRoute`...), for the few branches HTTP can't reach. */
    route: (name: string) => any;
    /** The mail transport double: what the routes and jobs sent. */
    transport: () => RecordingMailTransport;
}

/** A request as `user` (`null`: anonymous) to `path` under the context's prefix. */
export function call(ctx: CrmTestContext, method: "get" | "post" | "put" | "delete", path: string, user: TestUser | null, body?: unknown): Promise<any> {
    let chain: any = (request(ctx.app()) as any)[method](`${ctx.prefix}${path}`);
    if (user) {
        chain = chain.set("Authorization", `jwt ${user.token}`);
    }
    if (body !== undefined) {
        chain = chain.send(body);
    }
    return chain;
}

/** Creates a workspace owned by `ctx.users.owner` with `editor` and `viewer` as members in those roles. Returns its uid. */
export async function setUpWorkspace(ctx: CrmTestContext, name: string = "Acme Sales"): Promise<string> {
    const created = await call(ctx, "post", "/workspaces", ctx.users.owner, { name });
    expect(created.status).toBe(200);
    const workspaceUid: string = created.body.uid;
    for (const [user, role] of [
        [ctx.users.editor, "editor"],
        [ctx.users.viewer, "viewer"],
    ] as const) {
        const added = await call(ctx, "post", `/workspaces/${workspaceUid}/members`, ctx.users.owner, { userUid: user.uid, role });
        expect(added.status).toBe(200);
    }
    return workspaceUid;
}
