///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils } from "@rapidrest/service-core";
import type { CrmRepos } from "../models/CrmModelClasses.js";
import {
    Campaign,
    CampaignVariant,
    CrmCompany,
    CrmContact,
    CrmObjectType,
    EmailTemplate,
    MailingList,
    OutboundSend,
    PropertyDefinition,
    Workspace,
    WorkspaceSender,
} from "../models/types.js";
import { TemplateDesign } from "../templates/Design.js";
import { buildMergeContext } from "../templates/MergeContext.js";
import { RenderedEmail, compileDesign, renderEmail } from "../templates/Render.js";
import { composeMessage } from "../util/Mailer.js";
import { readValues } from "../util/PropertyValues.js";
import { signToken } from "../util/Tokens.js";
import { addOpenPixel, clickPath, trackLinks, verpAddress } from "./Tracking.js";

/** What the renderer needs from its job. */
export interface RendererSettings {
    /** The public site, without a trailing slash. */
    publicUrl: string;
    /** The key tokens and tracked links are signed with. */
    secret: string;
    /** Send bounces to a per-message address (`verpAddress()`). */
    verp: boolean;
}

/** One campaign message, ready for the mail transport. */
export interface CampaignMessage {
    raw: Buffer;
    envelopeFrom: string;
    /** The `Message-ID`, without angle brackets. */
    messageId: string;
    subject: string;
}

/** Why a message can't be rendered: its campaign's template or sender is gone. Not worth retrying. */
export class UnrenderableError extends Error {}

/**
 * Renders campaign messages, one per recipient: the variant's template filled in for the contact, with its unsubscribe and
 * preferences links (signed tokens), tracked links and the open image when the campaign tracks them, and the headers bulk mail
 * needs - `List-Unsubscribe` with RFC 8058 one-click, `List-Id`, `Precedence: bulk` and a `Feedback-ID`. Templates, senders and
 * workspaces are read once per renderer (one per dispatch run).
 */
export class CampaignRenderer {
    private readonly templates: Map<string, Promise<{ template: EmailTemplate; compiled: string } | undefined>> = new Map();
    private readonly records: Map<string, Promise<any>> = new Map();
    private readonly definitions: Map<string, Promise<PropertyDefinition[]>> = new Map();

    constructor(
        private readonly repos: CrmRepos,
        private readonly settings: RendererSettings,
    ) {}

    public async render(send: OutboundSend, campaign: Campaign, contact: CrmContact): Promise<CampaignMessage> {
        const variant: CampaignVariant | undefined = campaign.abTest?.variants.find((entry) => entry.id === send.variantId);
        const templateUid: string | undefined = variant?.templateUid ?? campaign.templateUid;
        const compiled = templateUid ? await this.template(templateUid) : undefined;
        const sender: WorkspaceSender | undefined = campaign.senderUid ? await this.record<WorkspaceSender>("workspaceSender", campaign.senderUid) : undefined;
        const workspace: Workspace | undefined = await this.record<Workspace>("workspace", campaign.workspaceUid);
        if (!compiled || !sender || !workspace) {
            throw new UnrenderableError("The campaign's template or sender no longer exists.");
        }
        const { secret, publicUrl } = this.settings;
        const unsubscribeToken: string = signToken({ p: "unsub", w: workspace.uid, c: contact.uid, l: campaign.listUids, s: send.uid }, secret);
        const links = {
            unsubscribe: `${publicUrl}/subscriptions/unsubscribe/${unsubscribeToken}`,
            preferences: `${publicUrl}/subscriptions/${signToken({ p: "prefs", w: workspace.uid, c: contact.uid }, secret)}`,
        };
        const company: CrmCompany | undefined = contact.companyUid ? await this.record<CrmCompany>("company", contact.companyUid) : undefined;
        const values = await readValues(await this.repos.get("propertyValue"), company ? [contact.uid, company.uid] : [contact.uid]);
        const definitions: PropertyDefinition[] = await this.workspaceDefinitions(workspace.uid);
        const firstList: MailingList | undefined = campaign.listUids[0] ? await this.record<MailingList>("mailingList", campaign.listUids[0]) : undefined;
        const context = buildMergeContext({
            workspace,
            contact,
            contactValues: values.get(contact.uid),
            contactDefinitions: definitions.filter((definition) => definition.objectType === CrmObjectType.CONTACT),
            company,
            companyValues: company ? values.get(company.uid) : undefined,
            companyDefinitions: definitions.filter((definition) => definition.objectType === CrmObjectType.COMPANY),
            sender,
            list: firstList ? { name: firstList.publicName } : undefined,
            links,
        });
        const email: RenderedEmail = await renderEmail(compiled.compiled, variant?.subject ?? compiled.template.subject, context);
        let html: string = email.html;
        if (campaign.trackClicks) {
            html = trackLinks(html, (url, index) => `${publicUrl}/api/mail/crm${clickPath(secret, send.token, index, url)}`, new Set([links.unsubscribe, links.preferences])).html;
        }
        if (campaign.trackOpens) {
            html = addOpenPixel(html, `${publicUrl}/api/mail/crm/t/o/${send.token}`);
        }
        const domain: string = sender.fromAddress.slice(sender.fromAddress.lastIndexOf("@") + 1);
        const messageId: string = `${send.token}@${domain}`;
        const raw: Buffer = await composeMessage({
            sender,
            to: contact.email,
            subject: email.subject,
            text: email.text,
            html,
            messageId: `<${messageId}>`,
            headers: {
                "List-Unsubscribe": `<${publicUrl}/api/mail/crm/public/unsubscribe/${unsubscribeToken}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                "List-Id": `${listIdName(firstList?.publicName ?? workspace.name)} <${campaign.listUids[0] ?? campaign.uid}.${workspace.uid}.crm.${domain}>`,
                Precedence: "bulk",
                "Feedback-ID": `${campaign.uid}:${workspace.uid}:crm:rapidmx`,
            },
        });
        return { raw, envelopeFrom: this.settings.verp ? verpAddress(sender.fromAddress, send.token) : sender.fromAddress, messageId, subject: email.subject };
    }

    private template(uid: string): Promise<{ template: EmailTemplate; compiled: string } | undefined> {
        let cached = this.templates.get(uid);
        if (!cached) {
            cached = (async () => {
                const template: EmailTemplate | undefined = await this.record<EmailTemplate>("template", uid);
                return template ? { template, compiled: await compileDesign(template.design as TemplateDesign, template.preheader ?? undefined) } : undefined;
            })();
            this.templates.set(uid, cached);
        }
        return cached;
    }

    private record<T>(name: "workspaceSender" | "workspace" | "company" | "template" | "mailingList", uid: string): Promise<T | undefined> {
        const key: string = `${name}:${uid}`;
        let cached = this.records.get(key);
        if (!cached) {
            cached = this.repos.get(name).then((repo) => repo.findOne(uid, { ignoreACL: true, skipCache: true }));
            this.records.set(key, cached);
        }
        return cached;
    }

    private workspaceDefinitions(workspaceUid: string): Promise<PropertyDefinition[]> {
        let cached = this.definitions.get(workspaceUid);
        if (!cached) {
            cached = this.repos
                .get<PropertyDefinition>("propertyDefinition")
                .then((repo) => repo.find({ workspaceUid: ModelUtils.literal(workspaceUid) }, { ignoreACL: true, limit: 1000, skipCache: true }));
            this.definitions.set(workspaceUid, cached);
        }
        return cached;
    }
}

/** A `List-Id` phrase: the name quoted, with the characters a quoted string can't hold removed. */
function listIdName(name: string): string {
    return `"${name.replace(/["\\\r\n]/g, "").slice(0, 100)}"`;
}
