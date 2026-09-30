///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils, RepoUtils, RouteDecorators } from "@rapidrest/service-core";
import type { JWTUser } from "@rapidrest/core";
import { Campaign, CampaignStatus, CrmContact, OutboundSend, SendStatus, Workspace, WorkspaceMember } from "../models/types.js";
import { badRequest, readBoolean, readPaging, requireObject } from "../util/Validation.js";
import { forbidden, notFound } from "../util/WorkspaceAccess.js";
import { CrmRouteBase } from "./CrmRouteBase.js";
const { Get, Param, Put, Query, User: AuthUser } = RouteDecorators;

/** A workspace as the deployment's administrators see it. */
export interface AdminWorkspace {
    uid: string;
    name: string;
    dateCreated: string;
    members: number;
    contacts: number;
    campaignsSent: number;
    sendingDisabled: boolean;
}

/** The deployment's CRM numbers. */
export interface AdminStats {
    workspaces: number;
    contacts: number;
    /** Campaign and automation messages sent in the last 24 hours. */
    sentLastDay: number;
    /** Messages waiting to go out. */
    queued: number;
}

/**
 * The deployment administration of the CRM (`/api/mail/crm/admin`), for callers holding a trusted role (`trusted_roles`, `admin` by
 * default) - they need no membership of any workspace, and see no workspace's contents:
 * - `GET /stats` - `AdminStats`.
 * - `GET /workspaces?limit=&page=` - every workspace with its size (`AdminWorkspace`), newest first (`limit` up to 100, 50 by default).
 * - `PUT /workspaces/:workspaceUid` - `{ sendingDisabled }`: stops (or lets go again) a workspace's campaign and automation email,
 * the abuse kill switch. Stopped messages stay queued.
 */
export abstract class BaseCrmAdminRoute extends CrmRouteBase {
    private requireAdmin(user: JWTUser | undefined): void {
        if (!user?.roles?.some((role) => this.trustedRoles.includes(role))) {
            throw forbidden();
        }
    }

    @Get("/stats")
    public async stats(@AuthUser user?: JWTUser): Promise<AdminStats> {
        this.requireAdmin(user);
        const options = { ignoreACL: true, skipCache: true };
        const sends: RepoUtils<OutboundSend> = await this.repo<OutboundSend>("outboundSend");
        return {
            workspaces: await (await this.repo<Workspace>("workspace")).count({}, options),
            contacts: await (await this.repo<CrmContact>("contact")).count({}, options),
            sentLastDay: await sends.count({ sentAt: ModelUtils.literal(new Date(Date.now() - 86_400_000), "gte") }, options),
            queued: await sends.count({ status: ModelUtils.literal(SendStatus.QUEUED) }, options),
        };
    }

    @Get("/workspaces")
    public async workspaces(@Query() query: Record<string, unknown> | undefined, @AuthUser user?: JWTUser): Promise<{ items: AdminWorkspace[]; total: number }> {
        this.requireAdmin(user);
        const paging = readPaging(query?.limit, query?.page, 100);
        const repo: RepoUtils<Workspace> = await this.repo<Workspace>("workspace");
        const options = { ignoreACL: true, skipCache: true };
        const workspaces: Workspace[] = await repo.find({ sort: { dateCreated: "DESC" } }, { ...options, limit: paging.limit, page: paging.page });
        const items: AdminWorkspace[] = [];
        for (const workspace of workspaces) {
            const scope = { workspaceUid: ModelUtils.literal(workspace.uid) };
            items.push({
                uid: workspace.uid,
                name: workspace.name,
                dateCreated: new Date(workspace.dateCreated).toISOString(),
                members: await (await this.repo<WorkspaceMember>("workspaceMember")).count(scope, options),
                contacts: await (await this.repo<CrmContact>("contact")).count(scope, options),
                campaignsSent: await (await this.repo<Campaign>("campaign")).count({ ...scope, status: ModelUtils.literal(CampaignStatus.SENT) }, options),
                sendingDisabled: !!workspace.sendingDisabled,
            });
        }
        return { items, total: await repo.count({}, options) };
    }

    @Put("/workspaces/:workspaceUid")
    public async setWorkspace(@Param("workspaceUid") workspaceUid: string, body: unknown, @AuthUser user?: JWTUser): Promise<{ uid: string; sendingDisabled: boolean }> {
        this.requireAdmin(user);
        const sendingDisabled: boolean | undefined = readBoolean(requireObject(body), "sendingDisabled");
        if (sendingDisabled === undefined) {
            throw badRequest("'sendingDisabled' is required.");
        }
        const repo: RepoUtils<Workspace> = await this.repo<Workspace>("workspace");
        const workspace: Workspace | undefined = await repo.findOne(workspaceUid, { ignoreACL: true, skipCache: true });
        if (!workspace) {
            throw notFound();
        }
        await repo.update({ uid: workspace.uid, version: workspace.version, sendingDisabled }, workspace, { ignoreACL: true, skipPush: true });
        this.logger?.info(`CrmAdmin: ${user!.uid} ${sendingDisabled ? "stopped" : "restored"} the email of workspace ${workspace.uid}.`);
        return { uid: workspace.uid, sendingDisabled };
    }
}
