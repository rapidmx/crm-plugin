///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { HttpRequest, ModelUtils, RateLimiter, RepoUtils, RouteDecorators } from "@rapidrest/service-core";
import { type MailTransport, rateLimitKeyForIp, resolveClientIp } from "@rapidmx/restapi";
import {
    CrmCompany,
    CrmContact,
    CrmForm,
    CrmObjectType,
    EmailStatus,
    FormField,
    MailingList,
    PropertyDefinition,
    PropertyType,
    PropertyValue,
    Subscription,
    SubscriptionStatus,
    TimelineKind,
    Workspace,
    WorkspaceSender,
} from "../models/types.js";
import type { BaseContactRoute } from "./BaseContactRoute.js";
import { CrmRouteBase } from "./CrmRouteBase.js";
import { sendSystemMessage, simpleHtml } from "../util/Mailer.js";
import { readValues } from "../util/PropertyValues.js";
import { TokenPayload, verifyToken } from "../util/Tokens.js";
import { badRequest, isObject, readEmail, readText } from "../util/Validation.js";
import { notFound } from "../util/WorkspaceAccess.js";
const { Config, Inject } = ObjectDecorators;
const { Get, Param, Post, Request } = RouteDecorators;

/** How long a double opt-in confirmation link works, in days. */
export const CONFIRM_TOKEN_DAYS = 7;

/** The name of a form's hidden trap field: people never fill it in, simple bots do. */
export const HONEYPOT_FIELD = "website";

/** A form as anyone may see it. */
export interface PublicForm {
    uid: string;
    title: string;
    description?: string;
    fields: (FormField & { type: "email" | "text" | PropertyType; options?: { value: string; label: string }[] })[];
}

/** What a form submission answers. */
export interface FormResult {
    /** `confirm`: an email asks the subscriber to confirm; `subscribed`: done. */
    result: "confirm" | "subscribed";
    message: string;
    redirectUrl?: string;
}

/** A subscriber's preferences as the preference center shows them. */
export interface PreferencesView {
    workspaceName: string;
    email: string;
    /** The contact has unsubscribed from all email. */
    unsubscribedAll: boolean;
    lists: { uid: string; name: string; description?: string; subscribed: boolean }[];
}

/**
 * The CRM's anonymous endpoints (`/api/mail/crm/public`), for the public pages and the links in emails. None takes a signed-in user;
 * a form is found by its uid, everything else by a signed token (`util/Tokens.ts`) from an email, which names the workspace and the
 * contact and can't be forged. Every endpoint is rate limited per client address, and answers 404 for anything it can't find or verify.
 *
 * - `GET /forms/:formUid`, `POST /forms/:formUid` - an enabled form, and submitting it: the address becomes (or fills in the blanks of)
 * a contact and is subscribed to the form's lists - straight away, or pending until confirmed when the form has double opt-in, in
 * which case a confirmation email is sent from the form's sender.
 * - `POST /confirm/:token` - confirms the pending subscriptions a confirmation email was about.
 * - `GET /preferences/:token`, `POST /preferences/:token` - the preference center: the lists a subscriber may join or leave, and
 * unsubscribing from all email.
 * - `POST /unsubscribe/:token` - one-click unsubscribe (RFC 8058: what a mail client posts for `List-Unsubscribe-Post`), from the
 * token's list, or from all email when it names none.
 */
export abstract class BasePublicRoute extends CrmRouteBase {
    /** The backend's concrete contact route, which writes contacts from forms exactly as the API does. */
    protected abstract contactRouteClass: any;

    @Inject("MailTransport")
    protected mailTransport?: MailTransport;

    @Inject(RateLimiter)
    protected rateLimiter?: RateLimiter;

    @Config("trusted_proxies", [])
    protected trustedProxies: string[] = [];

    private contactRoute?: BaseContactRoute;

    @Get("/forms/:formUid")
    public async getForm(@Param("formUid") formUid: string, @Request req: HttpRequest): Promise<PublicForm> {
        await this.limit("form-view", req);
        const form: CrmForm = await this.requireForm(formUid);
        const definitions: PropertyDefinition[] = await this.contactProperties(form.workspaceUid);
        return {
            uid: form.uid,
            title: form.title,
            description: form.description ?? undefined,
            fields: form.fields.flatMap((field): PublicForm["fields"] => {
                if (field.target === "email") {
                    return [{ ...field, type: "email" as const }];
                }
                if (!field.target.startsWith("properties.")) {
                    return [{ ...field, type: "text" as const }];
                }
                const definition: PropertyDefinition | undefined = definitions.find((entry) => `properties.${entry.key}` === field.target);
                // A property deleted since the form was made is left out.
                return definition ? [{ ...field, type: definition.type, options: definition.options.length > 0 ? definition.options : undefined }] : [];
            }),
        };
    }

    @Post("/forms/:formUid")
    public async submitForm(@Param("formUid") formUid: string, body: unknown, @Request req: HttpRequest): Promise<FormResult> {
        await this.limit("form-submit", req);
        const form: CrmForm = await this.requireForm(formUid);
        const request: Record<string, unknown> = isObject(body) ? body : {};
        const doneMessage: FormResult = { result: "subscribed", message: form.successMessage, redirectUrl: form.redirectUrl ?? undefined };
        // A bot filled in the trap: answer as if it worked, and do nothing.
        if (typeof request[HONEYPOT_FIELD] === "string" && request[HONEYPOT_FIELD] !== "") {
            return doneMessage;
        }
        const values: Record<string, unknown> = isObject(request.values) ? request.values : {};
        const definitions: PropertyDefinition[] = await this.contactProperties(form.workspaceUid);
        const submitted: Record<string, unknown> = this.readFormValues(form, values, definitions);
        const email: string = submitted.email as string;
        const ip: string | undefined = this.clientAddress(req);

        const contactRepo: RepoUtils<CrmContact> = await this.repo<CrmContact>("contact");
        const existing: CrmContact | undefined = (
            await contactRepo.find({ workspaceUid: ModelUtils.literal(form.workspaceUid), email: ModelUtils.literal(email) }, { ignoreACL: true, limit: 1, skipCache: true })
        )[0];
        const write: Record<string, unknown> = await this.contactWrite(form, submitted, existing, definitions);
        const { uid: contactUid } = await (await this.contacts()).importRow(form.workspaceUid, "", write, true);

        const lists: MailingList[] = [];
        for (const listUid of form.listUids) {
            const list: MailingList | undefined = await this.findList(form.workspaceUid, listUid);
            if (list) {
                lists.push(list);
            }
        }
        const pending: MailingList[] = [];
        for (const list of lists) {
            const subscription: Subscription = await this.setSubscription(
                form.workspaceUid,
                list.uid,
                contactUid,
                form.doubleOptIn ? SubscriptionStatus.PENDING : SubscriptionStatus.SUBSCRIBED,
                { source: "form", ip },
            );
            if (subscription.status === SubscriptionStatus.PENDING) {
                pending.push(list);
            }
        }
        if (!form.doubleOptIn && lists.length > 0) {
            await this.reactivate(form.workspaceUid, contactUid);
        }
        if (pending.length > 0) {
            await this.sendConfirmation(form, email, contactUid, pending);
        }
        await this.addTimeline({
            workspaceUid: form.workspaceUid,
            subjectType: CrmObjectType.CONTACT,
            subjectUid: contactUid,
            kind: TimelineKind.FORM_SUBMITTED,
            summary: `Submitted the form "${form.name}"`,
            data: { formUid: form.uid },
            refUid: form.uid,
        });
        await this.countSubmission(form);
        return pending.length > 0 ? { result: "confirm", message: "Check your inbox to confirm your subscription.", redirectUrl: form.redirectUrl ?? undefined } : doneMessage;
    }

    @Post("/confirm/:token")
    public async confirm(@Param("token") token: string, @Request req: HttpRequest): Promise<{ workspaceName: string; lists: string[] }> {
        await this.limit("confirm", req);
        const { payload, workspace, contact } = await this.resolveToken(token, "confirm");
        const confirmed: string[] = [];
        for (const listUid of payload.l ?? []) {
            const list: MailingList | undefined = await this.findList(workspace.uid, listUid);
            const subscription: Subscription | undefined = list ? await this.findSubscription(listUid, contact.uid) : undefined;
            if (list && subscription && subscription.status !== SubscriptionStatus.UNSUBSCRIBED) {
                await this.setSubscription(workspace.uid, listUid, contact.uid, SubscriptionStatus.SUBSCRIBED, { source: "double-opt-in", ip: this.clientAddress(req) });
                confirmed.push(list.publicName);
            }
        }
        if (confirmed.length > 0) {
            await this.reactivate(workspace.uid, contact.uid);
        }
        return { workspaceName: workspace.name, lists: confirmed };
    }

    @Get("/preferences/:token")
    public async getPreferences(@Param("token") token: string, @Request req: HttpRequest): Promise<PreferencesView> {
        await this.limit("preferences", req);
        const { workspace, contact } = await this.resolveToken(token, "prefs");
        return await this.preferencesView(workspace, contact);
    }

    /**
     * Changes a subscriber's preferences: `lists` maps list uids to whether to be subscribed (only lists the preference center shows -
     * visible ones and those the contact is on), and `unsubscribeAll: true` unsubscribes from every list and all email.
     * `unsubscribeAll: false` (or subscribing to a list) takes back an earlier "unsubscribe from all".
     */
    @Post("/preferences/:token")
    public async setPreferences(@Param("token") token: string, body: unknown, @Request req: HttpRequest): Promise<PreferencesView> {
        await this.limit("preferences", req);
        const { workspace, contact } = await this.resolveToken(token, "prefs");
        const request: Record<string, unknown> = isObject(body) ? body : {};
        const ip: string | undefined = this.clientAddress(req);
        if (request.unsubscribeAll === true) {
            await this.unsubscribeAll(workspace.uid, contact, "preferences", ip);
            return await this.preferencesView(workspace, (await this.findContact(workspace.uid, contact.uid))!);
        }
        const offered: string[] = (await this.preferencesView(workspace, contact)).lists.map((list) => list.uid);
        const changes: Record<string, unknown> = isObject(request.lists) ? request.lists : {};
        let subscribedAny: boolean = false;
        for (const [listUid, subscribed] of Object.entries(changes)) {
            if (!offered.includes(listUid) || typeof subscribed !== "boolean") {
                throw badRequest("'lists' must map lists the preference center offers to true or false.");
            }
            await this.setSubscription(workspace.uid, listUid, contact.uid, subscribed ? SubscriptionStatus.SUBSCRIBED : SubscriptionStatus.UNSUBSCRIBED, {
                source: "preferences",
                ip,
            });
            subscribedAny ||= subscribed;
        }
        if (subscribedAny || request.unsubscribeAll === false) {
            await this.reactivate(workspace.uid, contact.uid);
        }
        return await this.preferencesView(workspace, (await this.findContact(workspace.uid, contact.uid))!);
    }

    /** One-click unsubscribe. Answers with a preferences token, so the landing page can offer the preference center. */
    @Post("/unsubscribe/:token")
    public async unsubscribe(@Param("token") token: string, @Request req: HttpRequest): Promise<{ workspaceName: string; list?: string; preferencesToken: string }> {
        await this.limit("unsubscribe", req);
        const { payload, workspace, contact } = await this.resolveToken(token, "unsub");
        const ip: string | undefined = this.clientAddress(req);
        const preferencesToken: string = await this.token({ p: "prefs", w: workspace.uid, c: contact.uid });
        const listUid: string | undefined = payload.l?.[0];
        if (listUid) {
            const list: MailingList | undefined = await this.findList(workspace.uid, listUid);
            if (list) {
                await this.setSubscription(workspace.uid, listUid, contact.uid, SubscriptionStatus.UNSUBSCRIBED, { source: "unsubscribe-link", ip });
                return { workspaceName: workspace.name, list: list.publicName, preferencesToken };
            }
        }
        await this.unsubscribeAll(workspace.uid, contact, "unsubscribe-link", ip);
        return { workspaceName: workspace.name, preferencesToken };
    }

    /** Counts one request of `kind` against the caller's address. */
    private async limit(kind: string, req: HttpRequest): Promise<void> {
        const address: string | undefined = this.clientAddress(req);
        await this.rateLimiter?.checkAndIncrement(`crm-${kind}|${address ? rateLimitKeyForIp(address) : "unknown"}`, undefined, req);
    }

    /** The anonymous caller's address - `resolveClientIp()`, so a forged `X-Forwarded-For` from an untrusted peer is ignored. */
    protected clientAddress(req: HttpRequest): string | undefined {
        return resolveClientIp(req, this.trustedProxies);
    }

    private async contacts(): Promise<BaseContactRoute> {
        this.contactRoute ??= await this._objectFactory!.newInstance(this.contactRouteClass, { name: "crm-public" });
        return this.contactRoute;
    }

    private async requireForm(formUid: string): Promise<CrmForm> {
        const form: CrmForm | undefined =
            typeof formUid === "string" && formUid.length > 0 && formUid.length <= 64
                ? await (await this.repo<CrmForm>("form")).findOne(formUid, { ignoreACL: true, skipCache: true })
                : undefined;
        if (!form?.enabled) {
            throw notFound();
        }
        return form;
    }

    private async contactProperties(workspaceUid: string): Promise<PropertyDefinition[]> {
        return await (await this.repo<PropertyDefinition>("propertyDefinition")).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), objectType: ModelUtils.literal(CrmObjectType.CONTACT) },
            { ignoreACL: true, limit: 1000, skipCache: true },
        );
    }

    /**
     * The submitted value of each of the form's fields, checked: the email address, text fields as text, and each custom property as its
     * type (a number, yes/no, a date, one option or several). A required field left empty, or a value that doesn't fit, is a 400.
     */
    private readFormValues(form: CrmForm, values: Record<string, unknown>, definitions: PropertyDefinition[]): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const field of form.fields) {
            const raw: unknown = values[field.target];
            const empty: boolean = raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0) || raw === false;
            if (empty) {
                if (field.required) {
                    throw badRequest(`${field.label} is required.`);
                }
                continue;
            }
            if (field.target === "email") {
                result.email = readEmail({ email: raw }, "email", { required: true });
            } else if (field.target.startsWith("properties.")) {
                const definition: PropertyDefinition | undefined = definitions.find((entry) => `properties.${entry.key}` === field.target);
                if (definition) {
                    result[field.target] = this.propertyInput(definition, raw, field.label);
                }
            } else {
                result[field.target] = readText({ [field.target]: raw }, field.target);
            }
        }
        return result;
    }

    /** A form's input for a custom property as the property's type. */
    private propertyInput(definition: PropertyDefinition, raw: unknown, label: string): unknown {
        switch (definition.type) {
            case PropertyType.NUMBER: {
                const value: number = typeof raw === "number" ? raw : Number(String(raw).trim());
                if (!Number.isFinite(value)) {
                    throw badRequest(`${label} must be a number.`);
                }
                return value;
            }
            case PropertyType.BOOLEAN:
                return raw === true || raw === "true" || raw === "on";
            case PropertyType.MULTI_SELECT:
                return Array.isArray(raw) ? raw : [raw];
            default:
                return raw;
        }
    }

    /**
     * What a submission writes to its contact: every submitted field for a new contact (with the form's tags and source `form`); for an
     * existing one only the fields and properties it doesn't have yet, so a form can't overwrite what a workspace knows about someone.
     * A company name links the contact to that company (found by name, or created) when it has none.
     */
    private async contactWrite(
        form: CrmForm,
        submitted: Record<string, unknown>,
        existing: CrmContact | undefined,
        definitions: PropertyDefinition[],
    ): Promise<Record<string, unknown>> {
        const known: Record<string, PropertyValue[]> = existing ? ((await readValues(await this.repo("propertyValue"), [existing.uid])).get(existing.uid) ?? {}) : {};
        const write: Record<string, unknown> = { email: submitted.email, tags: form.tags };
        const properties: Record<string, unknown> = {};
        for (const [target, value] of Object.entries(submitted)) {
            if (target === "email") {
                continue;
            }
            if (target.startsWith("properties.")) {
                const key: string = target.slice("properties.".length);
                if (!known[key]?.length && definitions.some((definition) => definition.key === key)) {
                    properties[key] = value;
                }
            } else if (target === "company") {
                if (!existing?.companyUid) {
                    write.companyUid = await this.companyByName(form.workspaceUid, value as string);
                }
            } else if (!existing || (existing as any)[target] === undefined || (existing as any)[target] === null || (existing as any)[target] === "") {
                write[target] = value;
            }
        }
        if (Object.keys(properties).length > 0) {
            write.properties = properties;
        }
        if (!existing) {
            write.source = "form";
        }
        return write;
    }

    /** The workspace's company named `name`, created when there is none. */
    private async companyByName(workspaceUid: string, name: string): Promise<string> {
        const repo: RepoUtils<CrmCompany> = await this.repo<CrmCompany>("company");
        const found: CrmCompany | undefined = (
            await repo.find({ workspaceUid: ModelUtils.literal(workspaceUid), name: ModelUtils.literal(name) }, { ignoreACL: true, limit: 1, skipCache: true })
        )[0];
        if (found) {
            return found.uid;
        }
        const created: CrmCompany = await repo.create(new this.classes.company({ workspaceUid, name, tags: [] }), { ignoreACL: true, skipPush: true });
        await this.addTimeline({
            workspaceUid,
            subjectType: CrmObjectType.COMPANY,
            subjectUid: created.uid,
            kind: TimelineKind.CREATED,
            summary: "Created the company from a form",
        });
        return created.uid;
    }

    /** Emails the subscriber a link confirming their pending subscriptions to `lists`, from the form's sender. Never throws. */
    private async sendConfirmation(form: CrmForm, email: string, contactUid: string, lists: MailingList[]): Promise<void> {
        try {
            const sender: WorkspaceSender | undefined = form.senderUid
                ? await (await this.repo<WorkspaceSender>("workspaceSender")).findOne(form.senderUid, { ignoreACL: true, skipCache: true })
                : undefined;
            if (!sender || sender.workspaceUid !== form.workspaceUid) {
                this.logger?.warn(`PublicRoute: form ${form.uid} has no sender for its confirmation email.`);
                return;
            }
            const token: string = await this.token({
                p: "confirm",
                w: form.workspaceUid,
                c: contactUid,
                l: lists.map((list) => list.uid),
                x: Math.floor(Date.now() / 1000) + CONFIRM_TOKEN_DAYS * 24 * 3600,
            });
            const link: string = this.publicLink(`/subscriptions/confirm/${token}`);
            const names: string = lists.map((list) => list.publicName).join(", ");
            const paragraphs: string[] = [
                `Please confirm that you want to receive email from ${sender.fromName} (${names}).`,
                `If you didn't sign up, ignore this message: you won't be subscribed.`,
            ];
            await sendSystemMessage(this.mailTransport!, {
                sender,
                to: email,
                subject: "Please confirm your subscription",
                text: `${paragraphs[0]}\n\nConfirm: ${link}\n\n${paragraphs[1]}\n`,
                html: simpleHtml("Confirm your subscription", paragraphs, { label: "Confirm subscription", href: link }),
            });
            const repo: RepoUtils<Subscription> = await this.repo<Subscription>("subscription");
            for (const list of lists) {
                const subscription: Subscription | undefined = await this.findSubscription(list.uid, contactUid);
                await repo.update({ uid: subscription!.uid, version: subscription!.version, confirmSentAt: new Date() }, new this.classes.subscription(subscription), {
                    ignoreACL: true,
                    skipPush: true,
                });
            }
        } catch (err: any) {
            this.logger?.warn(`PublicRoute: could not send the confirmation email for form ${form.uid}: ${err?.message ?? err}`);
        }
    }

    private async countSubmission(form: CrmForm): Promise<void> {
        try {
            await (await this.repo<CrmForm>("form")).update(
                { uid: form.uid, version: form.version, submissionCount: form.submissionCount + 1 } as any,
                new this.classes.form(form),
                { ignoreACL: true, skipPush: true },
            );
        } catch {
            // Another submission counted at the same moment: the count is a statistic, not worth a retry.
        }
    }

    private async findSubscription(listUid: string, contactUid: string): Promise<Subscription | undefined> {
        return (
            await (await this.repo<Subscription>("subscription")).find(
                { listUid: ModelUtils.literal(listUid), contactUid: ModelUtils.literal(contactUid) },
                { ignoreACL: true, limit: 1, skipCache: true },
            )
        )[0];
    }

    private async findContact(workspaceUid: string, contactUid: string): Promise<CrmContact | undefined> {
        const contact: CrmContact | undefined = await (await this.repo<CrmContact>("contact")).findOne(contactUid, { ignoreACL: true, skipCache: true });
        return contact?.workspaceUid === workspaceUid ? contact : undefined;
    }

    /** The token's payload, workspace and contact - or a 404 for a bad token or one whose workspace or contact is gone. */
    private async resolveToken(token: string, purpose: TokenPayload["p"]): Promise<{ payload: TokenPayload; workspace: Workspace; contact: CrmContact }> {
        const payload: TokenPayload | undefined = verifyToken(token, await this.tokenSecret(), purpose);
        const workspace: Workspace | undefined = payload ? await (await this.repo<Workspace>("workspace")).findOne(payload.w, { ignoreACL: true }) : undefined;
        const contact: CrmContact | undefined = workspace ? await this.findContact(workspace.uid, payload!.c) : undefined;
        if (!contact) {
            throw notFound();
        }
        return { payload: payload!, workspace: workspace!, contact };
    }

    private async preferencesView(workspace: Workspace, contact: CrmContact): Promise<PreferencesView> {
        const lists: MailingList[] = await (await this.repo<MailingList>("mailingList")).find(
            { workspaceUid: ModelUtils.literal(workspace.uid), sort: { name: "ASC" } },
            { ignoreACL: true, limit: 1000, skipCache: true },
        );
        const subscriptions: Subscription[] = await (await this.repo<Subscription>("subscription")).find(
            { workspaceUid: ModelUtils.literal(workspace.uid), contactUid: ModelUtils.literal(contact.uid) },
            { ignoreACL: true, limit: 1000, skipCache: true },
        );
        const status = (listUid: string): SubscriptionStatus | undefined => subscriptions.find((entry) => entry.listUid === listUid)?.status;
        return {
            workspaceName: workspace.name,
            email: contact.email,
            unsubscribedAll: contact.emailStatus === EmailStatus.UNSUBSCRIBED,
            lists: lists
                .filter((list) => list.visible || status(list.uid) === SubscriptionStatus.SUBSCRIBED)
                .map((list) => ({
                    uid: list.uid,
                    name: list.publicName,
                    description: list.publicDescription ?? undefined,
                    subscribed: status(list.uid) === SubscriptionStatus.SUBSCRIBED,
                })),
        };
    }

    /** Unsubscribes the contact from every list, and marks them as not wanting any marketing email. */
    private async unsubscribeAll(workspaceUid: string, contact: CrmContact, source: string, ip: string | undefined): Promise<void> {
        const subscriptions: Subscription[] = await (await this.repo<Subscription>("subscription")).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), contactUid: ModelUtils.literal(contact.uid) },
            { ignoreACL: true, limit: 1000, skipCache: true },
        );
        for (const subscription of subscriptions) {
            await this.setSubscription(workspaceUid, subscription.listUid, contact.uid, SubscriptionStatus.UNSUBSCRIBED, { source, ip });
        }
        await this.setEmailStatus(workspaceUid, contact.uid, EmailStatus.UNSUBSCRIBED, EmailStatus.ACTIVE, "Unsubscribed from all email");
    }

    /** Takes back a contact's "unsubscribe from all" once they subscribe again. A bounced or complaining address stays as it is. */
    private async reactivate(workspaceUid: string, contactUid: string): Promise<void> {
        await this.setEmailStatus(workspaceUid, contactUid, EmailStatus.ACTIVE, EmailStatus.UNSUBSCRIBED, "Opted back in to email");
    }

    /** Moves the contact's `emailStatus` to `to` when it is `from`, with a timeline entry. */
    private async setEmailStatus(workspaceUid: string, contactUid: string, to: EmailStatus, from: EmailStatus, summary: string): Promise<void> {
        const contact: CrmContact | undefined = await this.findContact(workspaceUid, contactUid);
        if (contact?.emailStatus !== from) {
            return;
        }
        await (await this.repo<CrmContact>("contact")).update({ uid: contact.uid, version: contact.version, emailStatus: to } as any, new this.classes.contact(contact), {
            ignoreACL: true,
            skipPush: true,
        });
        await this.addTimeline({ workspaceUid, subjectType: CrmObjectType.CONTACT, subjectUid: contactUid, kind: TimelineKind.UPDATED, summary, data: { fields: ["emailStatus"] } });
    }
}
