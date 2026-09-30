///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import * as crypto from "crypto";
import { ObjectDecorators, type JWTUser } from "@rapidrest/core";
import { stripTrustedRoles } from "@rapidmx/restapi";
import { ACLUtils, ModelUtils, NotificationUtils, ObjectFactory, RepoUtils } from "@rapidrest/service-core";
import { CrmModelClasses, CrmModelName, CrmRepos } from "../models/CrmModelClasses.js";
import {
    CrmCompany,
    CrmContact,
    CrmObjectType,
    CrmSetting,
    PropertyDefinition,
    Workspace,
    MailingList,
    Subscription,
    SubscriptionStatus,
    TimelineEvent,
    TimelineKind,
    WorkspaceAction,
    WorkspaceMember,
    WorkspaceSender,
} from "../models/types.js";
import { MergeContext, sampleContext } from "../templates/Render.js";
import { buildMergeContext } from "../templates/MergeContext.js";
import { readValues } from "../util/PropertyValues.js";
import { readOrCreateTokenSecret } from "../util/Secrets.js";
import { TokenPayload, signToken } from "../util/Tokens.js";
import { assertWorkspaceAccess, notFound } from "../util/WorkspaceAccess.js";
import { badRequest } from "../util/Validation.js";
import { CrmEventType, recordCrmEvent } from "../automation/Events.js";
const { Config, Inject, Logger } = ObjectDecorators;

/** The `PropertyValue.key` a contact's subscribed lists are mirrored under, so filters can match list membership. */
export const LISTS_KEY = "lists";

/** The `CrmSetting` key of the generated token signing key. */

/** Who or what changed a subscription, and from where. */
export interface SubscriptionChange {
    /** `form`, `import`, `manual`, `preferences`, `unsubscribe-link`, `api`... */
    source: string;
    /** The subscriber's address, for consent given by the subscriber themselves. */
    ip?: string;
    /** The member who made the change, if a member did. */
    actorUserUid?: string;
}

/**
 * What every CRM route shares: the model classes of its backend (`classes`, from `MONGO_MODELS`/`SQL_MODELS`), their repositories,
 * workspace access checks, the workspace's push channel, the activity timeline, subscriptions, and the signed links in emails.
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

    /** The site the public pages (preference center, forms) are served from, e.g. `https://mail.example.com`. */
    @Config("mail:crm:public_url", "")
    protected publicUrl: string = "";

    /** The key tokens are signed with. Empty: one is generated and kept (`CrmSetting` `token-secret`). */
    @Config("mail:crm:token_secret", "")
    protected configuredTokenSecret: string = "";

    @Logger
    protected logger?: any;

    private crmRepos?: CrmRepos;
    private cachedTokenSecret?: string;

    /** The repositories of every model. */
    protected repos(): CrmRepos {
        this.crmRepos ??= new CrmRepos(this._objectFactory!, this.classes);
        return this.crmRepos;
    }

    /** The repository of `name`'s model. */
    protected async repo<T = any>(name: CrmModelName) {
        return await this.repos().get<T>(name);
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

    /** Whether the caller may change the workspace's settings (holds `MANAGE`), trusted roles aside. */
    protected async canManage(user: JWTUser | undefined, workspaceUid: string): Promise<boolean> {
        return await this.aclUtils!.hasPermission(stripTrustedRoles(user, this.trustedRoles), workspaceUid, WorkspaceAction.MANAGE);
    }

    /** The workspace `workspaceUid`, or a 404. */
    protected async requireWorkspaceRecord(workspaceUid: string): Promise<Workspace> {
        const workspace: Workspace | undefined = await (await this.repo<Workspace>("workspace")).findOne(workspaceUid, { ignoreACL: true });
        // Callers check access first, which already 404s for a missing workspace.
        /* v8 ignore if */
        if (!workspace) {
            throw notFound();
        }
        return workspace;
    }

    /**
     * The merge context of `contactUid` (a contact of the workspace, else a 400), or of a made-up reader when it is undefined - with the
     * sender and links given (links default to placeholders, for previews).
     */
    protected async mergeContextFor(
        workspace: Workspace,
        contactUid: unknown,
        sender?: WorkspaceSender,
        links: MergeContext["links"] = { unsubscribe: "#unsubscribe", preferences: "#preferences" },
    ): Promise<MergeContext> {
        const workspaceView = { name: workspace.name, postal_address: workspace.postalAddress ?? undefined, website: workspace.website ?? undefined };
        if (contactUid === undefined || contactUid === null || contactUid === "") {
            return { ...sampleContext(workspaceView, sender ? { name: sender.fromName, address: sender.fromAddress } : undefined), links };
        }
        const contact: CrmContact | undefined =
            typeof contactUid === "string" && contactUid.length <= 64
                ? await (await this.repo<CrmContact>("contact")).findOne(contactUid, { ignoreACL: true, skipCache: true })
                : undefined;
        if (!contact || contact.workspaceUid !== workspace.uid) {
            throw badRequest("'contactUid' must be a contact of the workspace.");
        }
        const company: CrmCompany | undefined = contact.companyUid
            ? await (await this.repo<CrmCompany>("company")).findOne(contact.companyUid, { ignoreACL: true, skipCache: true })
            : undefined;
        const values = await readValues(await this.repo("propertyValue"), company ? [contact.uid, company.uid] : [contact.uid]);
        const definitions: PropertyDefinition[] = await (await this.repo<PropertyDefinition>("propertyDefinition")).find(
            { workspaceUid: ModelUtils.literal(workspace.uid) },
            { ignoreACL: true, limit: 1000, skipCache: true },
        );
        return buildMergeContext({
            workspace,
            contact,
            contactValues: values.get(contact.uid),
            contactDefinitions: definitions.filter((definition) => definition.objectType === CrmObjectType.CONTACT),
            company,
            companyValues: company ? values.get(company.uid) : undefined,
            companyDefinitions: definitions.filter((definition) => definition.objectType === CrmObjectType.COMPANY),
            sender,
            links,
        });
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

    /** `senderUid` when it is a sender of the workspace, or a 400. */
    protected async requireSender(workspaceUid: string, senderUid: unknown): Promise<string> {
        const sender: WorkspaceSender | undefined =
            typeof senderUid === "string" && senderUid.length > 0 && senderUid.length <= 64
                ? await (await this.repo<WorkspaceSender>("workspaceSender")).findOne(senderUid, { ignoreACL: true, skipCache: true })
                : undefined;
        if (!sender || sender.workspaceUid !== workspaceUid) {
            throw badRequest("'senderUid' must be a sender of the workspace.");
        }
        return sender.uid;
    }

    /** The workspace's list `listUid`, or `undefined`. */
    protected async findList(workspaceUid: string, listUid: unknown): Promise<MailingList | undefined> {
        if (typeof listUid !== "string" || listUid.length === 0 || listUid.length > 64) {
            return undefined;
        }
        const list: MailingList | undefined = await (await this.repo<MailingList>("mailingList")).findOne(listUid, { ignoreACL: true, skipCache: true });
        return list?.workspaceUid === workspaceUid ? list : undefined;
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

    /**
     * The key tokens are signed with: `mail:crm:token_secret`, or else the generated one (`readOrCreateTokenSecret()`).
     */
    protected async tokenSecret(): Promise<string> {
        if (this.configuredTokenSecret) {
            return this.configuredTokenSecret;
        }
        if (this.cachedTokenSecret) {
            return this.cachedTokenSecret;
        }
        this.cachedTokenSecret = await readOrCreateTokenSecret(await this.repo<CrmSetting>("setting"), this.classes.setting);
        return this.cachedTokenSecret;
    }

    /** An absolute link to a public page under `mail:crm:public_url`, e.g. `publicLink("/subscriptions/<token>")`. */
    protected publicLink(path: string): string {
        return `${this.publicUrl.replace(/\/+$/, "")}${path}`;
    }

    /** A signed token for a public link - see `util/Tokens.ts`. */
    protected async token(payload: TokenPayload): Promise<string> {
        return signToken(payload, await this.tokenSecret());
    }

    /**
     * Sets a contact's subscription to a list: creates it, or moves it to `status`. A subscription already `subscribed` stays so when
     * asked to become `pending` (a form filled in again doesn't make a subscriber confirm twice). Keeps the contact's `lists` values
     * (what filters match on) in step, and records subscribing and unsubscribing on the contact's timeline. Returns the subscription.
     */
    public async setSubscription(
        workspaceUid: string,
        listUid: string,
        contactUid: string,
        status: SubscriptionStatus,
        change: SubscriptionChange,
    ): Promise<Subscription> {
        const repo: RepoUtils<Subscription> = await this.repo<Subscription>("subscription");
        const existing: Subscription | undefined = (
            await repo.find({ listUid: ModelUtils.literal(listUid), contactUid: ModelUtils.literal(contactUid) }, { ignoreACL: true, limit: 1, skipCache: true })
        )[0];
        if (existing && (existing.status === status || (existing.status === SubscriptionStatus.SUBSCRIBED && status === SubscriptionStatus.PENDING))) {
            return existing;
        }
        const now: Date = new Date();
        const fields: Record<string, unknown> = {
            status,
            source: change.source,
            ...(status === SubscriptionStatus.SUBSCRIBED ? { consentAt: now, consentIp: change.ip ?? null, unsubscribedAt: null } : {}),
            ...(status === SubscriptionStatus.PENDING ? { consentIp: change.ip ?? null, unsubscribedAt: null } : {}),
            ...(status === SubscriptionStatus.UNSUBSCRIBED ? { unsubscribedAt: now } : {}),
        };
        const subscription: Subscription = existing
            ? await repo.update({ ...fields, uid: existing.uid, version: existing.version }, new this.classes.subscription(existing), {
                  ignoreACL: true,
                  skipPush: true,
              })
            : await repo.create(new this.classes.subscription({ workspaceUid, listUid, contactUid, ...fields }), { ignoreACL: true, skipPush: true });

        const values: RepoUtils<any> = await this.repo("propertyValue");
        await values.truncate(
            { objectUid: ModelUtils.literal(contactUid), key: ModelUtils.literal(LISTS_KEY), stringValue: ModelUtils.literal(listUid) },
            { ignoreACL: true },
        );
        if (status === SubscriptionStatus.SUBSCRIBED) {
            await values.create(
                new this.classes.propertyValue({ workspaceUid, objectType: CrmObjectType.CONTACT, objectUid: contactUid, key: LISTS_KEY, stringValue: listUid }),
                { ignoreACL: true, skipPush: true },
            );
        }
        if (status !== SubscriptionStatus.PENDING) {
            const list: MailingList | undefined = await this.findList(workspaceUid, listUid);
            await this.addTimeline({
                workspaceUid,
                subjectType: CrmObjectType.CONTACT,
                subjectUid: contactUid,
                kind: status === SubscriptionStatus.SUBSCRIBED ? TimelineKind.SUBSCRIBED : TimelineKind.UNSUBSCRIBED,
                summary: `${status === SubscriptionStatus.SUBSCRIBED ? "Subscribed to" : "Unsubscribed from"} ${list?.name ?? "a list"}`,
                actorUserUid: change.actorUserUid,
                data: { listUid, source: change.source },
                refUid: listUid,
            });
        }
        if (status !== SubscriptionStatus.PENDING) {
            await recordCrmEvent(
                this.repos(),
                this.classes,
                {
                    workspaceUid,
                    type: status === SubscriptionStatus.SUBSCRIBED ? CrmEventType.LIST_SUBSCRIBED : CrmEventType.LIST_UNSUBSCRIBED,
                    contactUid,
                    data: { listUid, source: change.source },
                },
                this.logger,
            );
        }
        this.notify(workspaceUid, "CrmSubscription", existing ? "update" : "create", JSON.parse(JSON.stringify(subscription)));
        return subscription;
    }
}
