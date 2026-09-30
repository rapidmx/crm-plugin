///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators, type JWTUser } from "@rapidrest/core";
import { ACLUtils, ModelUtils, NotificationUtils, ObjectFactory } from "@rapidrest/service-core";
import { CrmModelClasses, CrmModelName, CrmRepos } from "../models/CrmModelClasses.js";
import { CrmObjectType, TimelineEvent, WorkspaceAction, WorkspaceMember } from "../models/types.js";
import { assertWorkspaceAccess } from "../util/WorkspaceAccess.js";
import { badRequest } from "../util/Validation.js";
const { Config, Inject, Logger } = ObjectDecorators;

/**
 * What every CRM route shares: the model classes of its backend (`classes`, from `MONGO_MODELS`/`SQL_MODELS`), their repositories,
 * workspace access checks, the workspace's push channel and the activity timeline.
 *
 * Every model keeps a deny-all class ACL; routes check the caller against the *workspace's* ACL (`requireAccess()`) and then read
 * and write with `ignoreACL: true`, always scoped by `workspaceUid`.
 */
export abstract class CrmRouteBase {
    protected abstract classes: CrmModelClasses;

    // Automatically injected by ObjectFactory on instantiation
    protected _objectFactory?: ObjectFactory;

    @Inject(ACLUtils)
    protected aclUtils?: ACLUtils;

    @Inject(NotificationUtils)
    protected notificationUtils?: NotificationUtils;

    /** Roles `ACLUtils.hasPermission()` would let through anything - stripped before every workspace check (`assertWorkspaceAccess()`). */
    @Config("trusted_roles", ["admin"])
    protected trustedRoles: string[] = ["admin"];

    @Logger
    protected logger?: any;

    private crmRepos?: CrmRepos;

    /** The repository of `name`'s model. */
    protected async repo<T = any>(name: CrmModelName) {
        this.crmRepos ??= new CrmRepos(this._objectFactory!, this.classes);
        return await this.crmRepos.get<T>(name);
    }

    /** Refuses a caller without `action` on `workspaceUid` - see `assertWorkspaceAccess()`. */
    protected async requireAccess(user: JWTUser | undefined, workspaceUid: string, action: WorkspaceAction): Promise<void> {
        await assertWorkspaceAccess(this.aclUtils!, this.trustedRoles, user, workspaceUid, action);
    }

    /** The membership of `userUid` in `workspaceUid`, if they are a member. */
    protected async findMember(workspaceUid: string, userUid: string): Promise<WorkspaceMember | undefined> {
        const members: WorkspaceMember[] = await (await this.repo("workspaceMember")).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), userUid: ModelUtils.literal(userUid.toLowerCase()) },
            { ignoreACL: true, limit: 1, skipCache: true },
        );
        return members[0];
    }

    /** `userUid` when it is a member of `workspaceUid` (a record's owner, a task's assignee), `null` to clear, or a 400. */
    protected async requireMemberUid(workspaceUid: string, userUid: string | null | undefined, field: string): Promise<string | null | undefined> {
        if (userUid === undefined || userUid === null) {
            return userUid;
        }
        const member: WorkspaceMember | undefined = await this.findMember(workspaceUid, userUid);
        if (!member) {
            throw badRequest(`'${field}' must be a member of the workspace.`);
        }
        return member.userUid;
    }

    /** Refuses (400) a `subjectType`/`subjectUid` pair that isn't a contact or company of `workspaceUid`. */
    protected async requireSubject(workspaceUid: string, subjectType: unknown, subjectUid: unknown): Promise<{ subjectType: CrmObjectType; subjectUid: string }> {
        const model: CrmModelName | undefined =
            subjectType === CrmObjectType.CONTACT ? "contact" : subjectType === CrmObjectType.COMPANY ? "company" : undefined;
        const record: { workspaceUid: string } | undefined =
            model && typeof subjectUid === "string" && subjectUid.length > 0 && subjectUid.length <= 64
                ? await (await this.repo(model)).findOne(subjectUid, { ignoreACL: true })
                : undefined;
        if (!record || record.workspaceUid !== workspaceUid) {
            throw badRequest("'subjectType' and 'subjectUid' must name a contact or company of the workspace.");
        }
        return { subjectType: subjectType as CrmObjectType, subjectUid: subjectUid as string };
    }

    /** Tells the workspace's open pages (everyone subscribed to its channel on `/push`) that `type` records changed. */
    protected notify(workspaceUid: string, type: string, action: "create" | "update" | "delete", data: unknown): void {
        this.notificationUtils?.sendMessage(workspaceUid, type, action, data);
    }

    /** Adds one entry to a record's activity timeline. Never throws: a timeline entry must not fail the change it records. */
    protected async addTimeline(entry: {
        workspaceUid: string;
        subjectType: CrmObjectType;
        subjectUid: string;
        kind: string;
        summary: string;
        actorUserUid?: string;
        data?: Record<string, unknown>;
        refUid?: string;
    }): Promise<void> {
        try {
            const timelineClass: any = this.classes.timelineEvent;
            await (await this.repo<TimelineEvent>("timelineEvent")).create(
                new timelineClass({ ...entry, data: entry.data ?? {}, occurredAt: new Date() }),
                { ignoreACL: true, skipPush: true },
            );
        } catch (err: any) {
            this.logger?.warn(`${this.constructor.name}: could not add a timeline entry: ${err?.message ?? err}`);
        }
    }
}
