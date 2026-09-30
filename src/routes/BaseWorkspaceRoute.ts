///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ApiError, ObjectDecorators, UserUtils, type JWTUser } from "@rapidrest/core";
import { ACLAction, type AccessControlList, ApiErrorMessages, ApiErrors, ModelUtils, RouteDecorators } from "@rapidrest/service-core";
import { hasMailAccess, type Mailbox } from "@rapidmx/restapi";
import { CrmModelName } from "../models/CrmModelClasses.js";
import { Workspace, WorkspaceAction, WorkspaceMember, WorkspaceRole, WorkspaceSender } from "../models/types.js";
import { isWorkspaceRole, memberRecord, notFound } from "../util/WorkspaceAccess.js";
import { MAX_LONG_TEXT, badRequest, conflict, readEmail, readText, requireObject } from "../util/Validation.js";
import { CrmRouteBase } from "./CrmRouteBase.js";
const { Config } = ObjectDecorators;
const { Delete, Get, Param, Post, Put, User: AuthUser } = RouteDecorators;

/** The action only an owner holds on a workspace's ACL - through their `*` grant, which includes every action. */
const OWNER_ACTION = "OWN";

/** How many times an ACL change is retried when a concurrent change to the same ACL won the race. */
const ACL_WRITE_ATTEMPTS = 5;

/** How many members and senders one workspace may have, by default (`mail:crm:max_members`, `mail:crm:max_senders`). */
export const MAX_MEMBERS = 500;
export const MAX_SENDERS = 50;

/** Every model whose rows belong to a workspace (by `workspaceUid`), deleted with it. */
const WORKSPACE_DATA: readonly CrmModelName[] = [
    "scoringRule",
    "segment",
    "engagementEvent",
    "outboundSend",
    "campaign",
    "savedBlock",
    "template",
    "form",
    "suppression",
    "subscription",
    "mailingList",
    "propertyValue",
    "timelineEvent",
    "note",
    "task",
    "contact",
    "company",
    "propertyDefinition",
    "import",
    "workspaceSender",
    "workspaceMember",
];

/** A workspace as its members see it: the record plus the caller's own role. */
export interface WorkspaceView extends Workspace {
    role: WorkspaceRole;
}

/**
 * CRM workspaces (`/api/mail/crm/workspaces`): creating one (the creator becomes its owner), listing the caller's, changing and deleting
 * them, and managing who is a member with which role, and which addresses the workspace sends as.
 *
 * A workspace's `AccessControlList` (uid = the workspace's uid, created with it) holds one record per member granting their role's
 * actions (`ROLE_ACTIONS`); every other CRM route checks the caller against it. `WorkspaceMember` rows mirror those records so a
 * member's workspaces can be listed and its members shown; this route changes both together.
 */
export abstract class BaseWorkspaceRoute extends CrmRouteBase {
    /** Roles allowed to create a workspace, comma-separated; empty lets every signed-in user. */
    @Config("mail:crm:workspace_creator_roles", "")
    protected creatorRoles: string = "";

    @Config("mail:crm:max_workspaces_per_user", 10)
    protected maxWorkspacesPerUser: number = 10;

    @Config("mail:crm:max_members", MAX_MEMBERS)
    protected maxMembers: number = MAX_MEMBERS;

    @Config("mail:crm:max_senders", MAX_SENDERS)
    protected maxSenders: number = MAX_SENDERS;

    @Get("/")
    public async list(@AuthUser user?: JWTUser): Promise<WorkspaceView[]> {
        const userUid: string = this.requireUser(user);
        const memberships: WorkspaceMember[] = await (await this.repo("workspaceMember")).find(
            { userUid: ModelUtils.literal(userUid), sort: { dateCreated: "ASC" } },
            { ignoreACL: true, limit: 1000, skipCache: true },
        );
        const workspaceRepo = await this.repo<Workspace>("workspace");
        const views: WorkspaceView[] = [];
        for (const membership of memberships) {
            const workspace: Workspace | undefined = await workspaceRepo.findOne(membership.workspaceUid, { ignoreACL: true });
            if (workspace) {
                views.push({ ...this.plain(workspace), role: membership.role });
            }
        }
        return views;
    }

    @Post("/")
    public async create(body: unknown, @AuthUser user?: JWTUser): Promise<WorkspaceView> {
        const userUid: string = this.requireUser(user);
        const allowed: string[] = this.creatorRoles
            .split(",")
            .map((role) => role.trim())
            .filter(Boolean);
        if (allowed.length > 0 && !UserUtils.hasRoles(user, allowed)) {
            throw new ApiError(ApiErrors.AUTH_PERMISSION_FAILURE, 403, "You are not allowed to create CRM workspaces.");
        }
        const fields: Partial<Workspace> = this.readWorkspace(requireObject(body), true);
        const workspaceRepo = await this.repo<Workspace>("workspace");
        const owned: number = await workspaceRepo.count({ createdByUserUid: ModelUtils.literal(userUid) }, { ignoreACL: true });
        if (owned >= this.maxWorkspacesPerUser) {
            throw badRequest(`You may create at most ${this.maxWorkspacesPerUser} workspaces.`);
        }
        const workspaceClass: any = this.classes.workspace;
        const instance: Workspace = new workspaceClass({ ...fields, createdByUserUid: userUid });
        const workspace: Workspace = await workspaceRepo.create(instance, {
            ignoreACL: true,
            acl: { uid: instance.uid, records: [memberRecord(userUid, WorkspaceRole.OWNER)] },
        });
        const memberClass: any = this.classes.workspaceMember;
        await (await this.repo("workspaceMember")).create(new memberClass({ workspaceUid: workspace.uid, userUid, role: WorkspaceRole.OWNER }), {
            ignoreACL: true,
        });
        return { ...this.plain(workspace), role: WorkspaceRole.OWNER };
    }

    @Get("/:workspaceUid")
    public async get(@Param("workspaceUid") workspaceUid: string, @AuthUser user?: JWTUser): Promise<WorkspaceView> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        const workspace: Workspace = await this.requireWorkspace(workspaceUid);
        const member: WorkspaceMember | undefined = await this.findMember(workspaceUid, user!.uid);
        return { ...this.plain(workspace), role: member?.role ?? WorkspaceRole.VIEWER };
    }

    @Put("/:workspaceUid")
    public async update(@Param("workspaceUid") workspaceUid: string, body: unknown, @AuthUser user?: JWTUser): Promise<WorkspaceView> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.MANAGE);
        const workspace: Workspace = await this.requireWorkspace(workspaceUid);
        const request: Record<string, unknown> = requireObject(body);
        const fields: Partial<Workspace> = this.readWorkspace(request, false);
        const updated: Workspace = await (await this.repo<Workspace>("workspace")).update(
            { ...fields, uid: workspace.uid, version: this.requestVersion(request, workspace) } as any,
            workspace,
            { ignoreACL: true, skipPush: true },
        );
        this.notify(workspaceUid, "Workspace", "update", this.plain(updated));
        return this.get(workspaceUid, user);
    }

    /** Deletes the workspace and everything in it. Owners only. */
    @Delete("/:workspaceUid")
    public async remove(@Param("workspaceUid") workspaceUid: string, @AuthUser user?: JWTUser): Promise<void> {
        await this.requireAccess(user, workspaceUid, OWNER_ACTION as WorkspaceAction);
        const workspace: Workspace = await this.requireWorkspace(workspaceUid);
        for (const name of WORKSPACE_DATA) {
            await (await this.repo(name)).truncate({ workspaceUid: ModelUtils.literal(workspaceUid) }, { ignoreACL: true, skipPush: true });
        }
        // The workspace's own ACL goes with it (a record-ACL model's delete removes it).
        await (await this.repo("workspace")).delete(workspace.uid, { ignoreACL: true, purge: true });
        this.notify(workspaceUid, "Workspace", "delete", { uid: workspaceUid });
    }

    @Get("/:workspaceUid/members")
    public async listMembers(@Param("workspaceUid") workspaceUid: string, @AuthUser user?: JWTUser): Promise<WorkspaceMember[]> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        return (await this.members(workspaceUid)).map((member) => this.plain(member));
    }

    /**
     * Adds a member by `userUid`, or by `address` - resolved to the owner of the mailbox with that address, so a colleague can be
     * added by their email address. Only an owner can add another owner.
     */
    @Post("/:workspaceUid/members")
    public async addMember(@Param("workspaceUid") workspaceUid: string, body: unknown, @AuthUser user?: JWTUser): Promise<WorkspaceMember> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.MANAGE);
        await this.requireWorkspace(workspaceUid);
        const request: Record<string, unknown> = requireObject(body);
        const role: WorkspaceRole = this.readRole(request);
        if (role === WorkspaceRole.OWNER) {
            await this.requireAccess(user, workspaceUid, OWNER_ACTION as WorkspaceAction);
        }
        const person: { userUid: string; address?: string; displayName?: string } = await this.resolvePerson(request);
        const existing: WorkspaceMember[] = await this.members(workspaceUid);
        if (existing.some((member) => member.userUid === person.userUid)) {
            throw conflict("That person is already a member of this workspace.");
        }
        if (existing.length >= this.maxMembers) {
            throw badRequest(`A workspace may have at most ${this.maxMembers} members.`);
        }
        const memberClass: any = this.classes.workspaceMember;
        const member: WorkspaceMember = await (await this.repo("workspaceMember")).create(
            new memberClass({ workspaceUid, ...person, role, addedByUserUid: user!.uid.toLowerCase() }),
            { ignoreACL: true, skipPush: true },
        );
        await this.setAclRecord(workspaceUid, person.userUid, role);
        this.notify(workspaceUid, "WorkspaceMember", "create", this.plain(member));
        return this.plain(member);
    }

    /** Changes a member's role. Making someone an owner, or changing an owner's role, takes an owner; the last owner stays one. */
    @Put("/:workspaceUid/members/:userUid")
    public async updateMember(
        @Param("workspaceUid") workspaceUid: string,
        @Param("userUid") memberUid: string,
        body: unknown,
        @AuthUser user?: JWTUser,
    ): Promise<WorkspaceMember> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.MANAGE);
        const role: WorkspaceRole = this.readRole(requireObject(body));
        const members: WorkspaceMember[] = await this.members(workspaceUid);
        const member: WorkspaceMember | undefined = members.find((entry) => entry.userUid === String(memberUid).toLowerCase());
        if (!member) {
            throw notFound();
        }
        if (role === WorkspaceRole.OWNER || member.role === WorkspaceRole.OWNER) {
            await this.requireAccess(user, workspaceUid, OWNER_ACTION as WorkspaceAction);
        }
        this.keepAnOwner(members, member, role);
        const updated: WorkspaceMember = await (await this.repo<WorkspaceMember>("workspaceMember")).update(
            { uid: member.uid, version: member.version, role } as any,
            member,
            { ignoreACL: true, skipPush: true },
        );
        await this.setAclRecord(workspaceUid, member.userUid, role);
        this.notify(workspaceUid, "WorkspaceMember", "update", this.plain(updated));
        return this.plain(updated);
    }

    /** Removes a member. A member may always leave; removing someone else takes `MANAGE`, and removing an owner takes an owner. */
    @Delete("/:workspaceUid/members/:userUid")
    public async removeMember(@Param("workspaceUid") workspaceUid: string, @Param("userUid") memberUid: string, @AuthUser user?: JWTUser): Promise<void> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        const members: WorkspaceMember[] = await this.members(workspaceUid);
        const member: WorkspaceMember | undefined = members.find((entry) => entry.userUid === String(memberUid).toLowerCase());
        if (!member) {
            throw notFound();
        }
        if (member.userUid !== user!.uid.toLowerCase()) {
            await this.requireAccess(user, workspaceUid, WorkspaceAction.MANAGE);
            if (member.role === WorkspaceRole.OWNER) {
                await this.requireAccess(user, workspaceUid, OWNER_ACTION as WorkspaceAction);
            }
        }
        this.keepAnOwner(members, member, undefined);
        await this.setAclRecord(workspaceUid, member.userUid, undefined);
        await (await this.repo("workspaceMember")).delete(member.uid, { ignoreACL: true, purge: true, skipPush: true });
        this.notify(workspaceUid, "WorkspaceMember", "delete", { uid: member.uid, userUid: member.userUid });
    }

    @Get("/:workspaceUid/senders")
    public async listSenders(@Param("workspaceUid") workspaceUid: string, @AuthUser user?: JWTUser): Promise<WorkspaceSender[]> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        return (await this.senders(workspaceUid)).map((sender) => this.plain(sender));
    }

    /**
     * Adds an address the workspace sends as. The caller must be able to change the mailbox the address belongs to (update access:
     * its owner or a delegate) - otherwise any workspace admin could send as anyone's mailbox - and the address must be the
     * mailbox's primary address or one of its aliases.
     */
    @Post("/:workspaceUid/senders")
    public async addSender(@Param("workspaceUid") workspaceUid: string, body: unknown, @AuthUser user?: JWTUser): Promise<WorkspaceSender> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.MANAGE);
        await this.requireWorkspace(workspaceUid);
        const request: Record<string, unknown> = requireObject(body);
        const fromAddress: string = readEmail(request, "fromAddress", { required: true })!;
        const mailbox: Mailbox = await this.requireSendableMailbox(user, fromAddress);
        const existing: WorkspaceSender[] = await this.senders(workspaceUid);
        if (existing.some((sender) => sender.fromAddress === fromAddress)) {
            throw conflict("The workspace already sends as that address.");
        }
        if (existing.length >= this.maxSenders) {
            throw badRequest(`A workspace may have at most ${this.maxSenders} senders.`);
        }
        const senderClass: any = this.classes.workspaceSender;
        const sender: WorkspaceSender = await (await this.repo("workspaceSender")).create(
            new senderClass({
                workspaceUid,
                mailboxUid: mailbox.uid,
                fromAddress,
                fromName: readText(request, "fromName") ?? mailbox.displayName,
                replyToAddress: readEmail(request, "replyToAddress") ?? undefined,
                createdByUserUid: user!.uid.toLowerCase(),
            }),
            { ignoreACL: true, skipPush: true },
        );
        this.notify(workspaceUid, "WorkspaceSender", "create", this.plain(sender));
        return this.plain(sender);
    }

    @Put("/:workspaceUid/senders/:senderUid")
    public async updateSender(
        @Param("workspaceUid") workspaceUid: string,
        @Param("senderUid") senderUid: string,
        body: unknown,
        @AuthUser user?: JWTUser,
    ): Promise<WorkspaceSender> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.MANAGE);
        const sender: WorkspaceSender = await this.requireWorkspaceSender(workspaceUid, senderUid);
        const request: Record<string, unknown> = requireObject(body);
        const fromName: string | null | undefined = readText(request, "fromName");
        const replyToAddress: string | null | undefined = readEmail(request, "replyToAddress");
        const updated: WorkspaceSender = await (await this.repo<WorkspaceSender>("workspaceSender")).update(
            {
                uid: sender.uid,
                version: sender.version,
                ...(fromName !== undefined ? { fromName: fromName ?? "" } : {}),
                ...(replyToAddress !== undefined ? { replyToAddress } : {}),
            } as any,
            sender,
            { ignoreACL: true, skipPush: true },
        );
        this.notify(workspaceUid, "WorkspaceSender", "update", this.plain(updated));
        return this.plain(updated);
    }

    @Delete("/:workspaceUid/senders/:senderUid")
    public async removeSender(@Param("workspaceUid") workspaceUid: string, @Param("senderUid") senderUid: string, @AuthUser user?: JWTUser): Promise<void> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.MANAGE);
        const sender: WorkspaceSender = await this.requireWorkspaceSender(workspaceUid, senderUid);
        await (await this.repo("workspaceSender")).delete(sender.uid, { ignoreACL: true, purge: true, skipPush: true });
        this.notify(workspaceUid, "WorkspaceSender", "delete", { uid: sender.uid });
    }

    /** The caller's uid, lowercased, or a 401 for an anonymous caller. */
    private requireUser(user: JWTUser | undefined): string {
        if (!user?.uid) {
            throw new ApiError(ApiErrors.AUTH_REQUIRED, 401, ApiErrorMessages.AUTH_REQUIRED);
        }
        return user.uid.toLowerCase();
    }

    /** The workspace fields of a create (`required`: `name`) or update request. */
    private readWorkspace(body: Record<string, unknown>, required: boolean): Partial<Workspace> {
        const fields: Partial<Workspace> = {};
        const name: string | null | undefined = readText(body, "name", { required });
        if (name === null) {
            throw badRequest("'name' is required.");
        }
        if (name !== undefined) {
            fields.name = name;
        }
        const timezone: string | null | undefined = readText(body, "timezone", { max: 64 });
        if (timezone) {
            if (!isTimeZone(timezone)) {
                throw badRequest("'timezone' must be an IANA time zone such as Europe/Paris.");
            }
            fields.timezone = timezone;
        }
        for (const [field, max] of [
            ["description", MAX_LONG_TEXT],
            ["postalAddress", 1000],
            ["website", 512],
        ] as const) {
            const value: string | null | undefined = readText(body, field, { max });
            if (value !== undefined) {
                (fields as any)[field] = value;
            }
        }
        return fields;
    }

    /** The version an update was based on (the request's `version`, else the stored one - last writer wins). */
    private requestVersion(body: Record<string, unknown>, stored: { version: number }): number {
        return typeof body.version === "number" ? body.version : stored.version;
    }

    private readRole(body: Record<string, unknown>): WorkspaceRole {
        if (!isWorkspaceRole(body.role)) {
            throw badRequest(`'role' must be one of: ${Object.values(WorkspaceRole).join(", ")}.`);
        }
        return body.role;
    }

    /** Who a member request names: `userUid` as given, or `address` as the owner of the mailbox with that address. */
    private async resolvePerson(body: Record<string, unknown>): Promise<{ userUid: string; address?: string; displayName?: string }> {
        if (typeof body.userUid === "string" && body.userUid.trim().length > 0 && body.userUid.length <= 128) {
            return { userUid: body.userUid.trim().toLowerCase() };
        }
        const address: string | null | undefined = readEmail(body, "address");
        if (!address) {
            throw badRequest("Name the new member by 'address' or 'userUid'.");
        }
        const mailbox: Mailbox | undefined = await this.findMailboxByAddress(address);
        if (!mailbox?.ownerUserUid) {
            throw badRequest(`Nobody on this server has the address ${address}.`);
        }
        return { userUid: mailbox.ownerUserUid.toLowerCase(), address: mailbox.primarySmtpAddress, displayName: mailbox.displayName };
    }

    /**
     * The mailbox whose primary address is `address` (lowercase). Only the primary address: a member or sender is named by the
     * mailbox's own address, so an alias never silently picks some other mailbox.
     */
    private async findMailboxByAddress(address: string): Promise<Mailbox | undefined> {
        const matches: Mailbox[] = await (await this.repo<Mailbox>("mailbox")).find(
            { primarySmtpAddress: ModelUtils.literal(address) },
            { ignoreACL: true, limit: 1, skipCache: true },
        );
        return matches[0];
    }

    /** The mailbox `address` belongs to, when the caller may send from it (update access to the mailbox), else a 400. */
    private async requireSendableMailbox(user: JWTUser | undefined, address: string): Promise<Mailbox> {
        const mailbox: Mailbox | undefined = await this.findMailboxByAddress(address);
        if (!mailbox || !(await hasMailAccess(this.aclUtils, this.trustedRoles, user, mailbox.uid, ACLAction.UPDATE))) {
            throw badRequest(`You can't send as ${address}: it must be the address of a mailbox you can send from.`);
        }
        return mailbox;
    }

    private async requireWorkspace(workspaceUid: string): Promise<Workspace> {
        const workspace: Workspace | undefined = await (await this.repo<Workspace>("workspace")).findOne(workspaceUid, { ignoreACL: true });
        /* v8 ignore if -- every caller has just passed `requireAccess()`, whose ACL is deleted together with the workspace (a record-ACL
           model's delete removes it), so only a concurrent delete gets here */
        if (!workspace) {
            throw notFound();
        }
        return workspace;
    }

    private async requireWorkspaceSender(workspaceUid: string, senderUid: string): Promise<WorkspaceSender> {
        const sender: WorkspaceSender | undefined = await (await this.repo<WorkspaceSender>("workspaceSender")).findOne(senderUid, { ignoreACL: true });
        if (!sender || sender.workspaceUid !== workspaceUid) {
            throw notFound();
        }
        return sender;
    }

    private async members(workspaceUid: string): Promise<WorkspaceMember[]> {
        return await (await this.repo<WorkspaceMember>("workspaceMember")).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), sort: { dateCreated: "ASC" } },
            { ignoreACL: true, limit: 1000, skipCache: true },
        );
    }

    private async senders(workspaceUid: string): Promise<WorkspaceSender[]> {
        return await (await this.repo<WorkspaceSender>("workspaceSender")).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), sort: { dateCreated: "ASC" } },
            { ignoreACL: true, limit: 1000, skipCache: true },
        );
    }

    /** Refuses (409) a change that would leave the workspace without an owner: `member` becoming `role` (`undefined`: leaving). */
    private keepAnOwner(members: WorkspaceMember[], member: WorkspaceMember, role: WorkspaceRole | undefined): void {
        const owners: number = members.filter((entry) => entry.role === WorkspaceRole.OWNER).length;
        if (member.role === WorkspaceRole.OWNER && role !== WorkspaceRole.OWNER && owners <= 1) {
            throw conflict("A workspace must keep at least one owner. Make someone else an owner first.");
        }
    }

    /** Grants `userUid` the actions of `role` on the workspace's ACL, or removes their record (`role` undefined). Retries lost races. */
    private async setAclRecord(workspaceUid: string, userUid: string, role: WorkspaceRole | undefined): Promise<void> {
        for (let attempt = 1; ; attempt++) {
            const acl: AccessControlList | undefined = await this.aclUtils!.findACL(workspaceUid, [], { skipCache: true, skipParents: true });
            /* v8 ignore if -- the caller's access was just checked against this very ACL; only a concurrent workspace delete removes it */
            if (!acl) {
                throw notFound();
            }
            acl.records = acl.records.filter((record) => record.userOrRoleId !== userUid);
            if (role) {
                acl.records.push(memberRecord(userUid, role));
            }
            try {
                await this.aclUtils!.saveACL(acl);
                return;
            } catch (err: any) {
                if (attempt >= ACL_WRITE_ATTEMPTS || !/version/i.test(err?.message ?? "")) {
                    throw err;
                }
            }
        }
    }

    /** A plain copy of a stored record, for a response. */
    protected plain<T>(record: T): T {
        return JSON.parse(JSON.stringify(record));
    }
}

/** Whether `zone` is an IANA time zone this runtime knows. */
export function isTimeZone(zone: string): boolean {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}
