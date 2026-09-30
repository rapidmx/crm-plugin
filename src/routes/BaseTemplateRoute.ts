///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ACLAction, ModelUtils, RouteDecorators } from "@rapidrest/service-core";
import { type JWTUser, ObjectDecorators } from "@rapidrest/core";
import { hasMailAccess, type Mailbox, type MailTransport } from "@rapidmx/restapi";
import { EmailTemplate, PropertyDefinition, WorkspaceAction, WorkspaceSender } from "../models/types.js";
import { DesignBlock, TemplateDesign, designBlocks, hasUnsubscribeLink, starterDesign, validateDesign } from "../templates/Design.js";
import { MERGE_TAGS } from "../templates/MergeContext.js";
import { MergeContext, RenderedEmail, checkMergeTags, compileDesign, renderEmail } from "../templates/Render.js";
import { sanitizeBlockHtml, sanitizeText } from "../templates/Sanitize.js";
import { sendSystemMessage } from "../util/Mailer.js";
import { badRequest, readEmail, readText, requireObject } from "../util/Validation.js";
import { BaseWorkspaceRecordRoute, WriteContext } from "./BaseWorkspaceRecordRoute.js";
const { Inject } = ObjectDecorators;
const { Get, Param, Post, User: AuthUser } = RouteDecorators;

/** How many templates one workspace may have. */
export const MAX_TEMPLATES = 1000;

/** A template as the API shows it: the template, and whether its design lets readers unsubscribe (campaigns require it). */
export interface EmailTemplateView extends EmailTemplate {
    hasUnsubscribeLink: boolean;
}

/**
 * A workspace's email templates (`/api/mail/crm/templates`) - see `BaseWorkspaceRecordRoute` for the endpoints - plus:
 * - `POST /:workspaceUid/render` - `{ design, subject, preheader?, contactUid? }` to `{ subject, html, text }`: a preview of a design, saved
 * or not, for one contact or a made-up reader.
 * - `POST /:workspaceUid/:uid/test` - `{ to, senderUid, contactUid? }`: sends the template to one address of a mailbox the caller can
 * read (so a test send can't mail strangers), subject prefixed "[Test]".
 * - `POST /:workspaceUid/:uid/duplicate` - a copy named "Copy of ...".
 * - `GET /:workspaceUid/merge-tags` - the merge tags a template can use, the workspace's custom properties included.
 *
 * A template's design is checked and sanitized on save (`templates/Design.ts`), compiled with MJML, and its merge tags are parsed, so a
 * template that can't be sent is refused at once. Hand-written HTML blocks can only be added or changed by workspace admins.
 */
export abstract class BaseTemplateRoute extends BaseWorkspaceRecordRoute<EmailTemplate, EmailTemplateView> {
    protected readonly model = "template" as const;
    protected readonly pushType: string = "CrmEmailTemplate";
    protected override readonly sortFields: readonly string[] = ["name"];
    protected override readonly maxRecords: number = MAX_TEMPLATES;

    @Inject("MailTransport")
    protected mailTransport?: MailTransport;

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<EmailTemplate>> {
        const fields: Partial<EmailTemplate> = await this.readFields(body, context, undefined);
        fields.design ??= starterDesign();
        await this.checkCompiles(fields.design as TemplateDesign, fields.subject!, fields.preheader);
        return fields;
    }

    protected async readUpdate(body: Record<string, unknown>, existing: EmailTemplate, context: WriteContext): Promise<Partial<EmailTemplate>> {
        const fields: Partial<EmailTemplate> = await this.readFields(body, context, existing);
        await this.checkCompiles(
            (fields.design ?? existing.design) as TemplateDesign,
            fields.subject ?? existing.subject,
            "preheader" in fields ? (fields.preheader ?? undefined) : (existing.preheader ?? undefined),
        );
        return fields;
    }

    private async readFields(body: Record<string, unknown>, context: WriteContext, existing: EmailTemplate | undefined): Promise<Partial<EmailTemplate>> {
        const fields: Record<string, unknown> = {};
        for (const [field, required, max] of [
            ["name", true, undefined],
            ["subject", true, 998],
            ["preheader", false, 500],
            ["category", false, undefined],
        ] as const) {
            const value: string | null | undefined = readText(body, field, { required: required && !existing, max });
            if (value === null && required) {
                throw badRequest(`'${field}' is required.`);
            }
            if (value !== undefined) {
                fields[field] = value;
            }
        }
        if (body.design !== undefined) {
            fields.design = await this.readDesign(body.design, context, existing);
        }
        return fields;
    }

    /** The design of a request, checked - hand-written HTML only from an admin, unless unchanged from `existing`. */
    private async readDesign(raw: unknown, context: WriteContext, existing: EmailTemplate | undefined): Promise<TemplateDesign> {
        const previous: Map<string, DesignBlock> = new Map(
            existing ? designBlocks(existing.design as TemplateDesign).map((block) => [block.id, block] as [string, DesignBlock]) : [],
        );
        return validateDesign(raw, {
            allowHtml: await this.canManage(context.user, context.workspaceUid),
            previous,
            sanitizeText,
            sanitizeHtml: sanitizeBlockHtml,
        });
    }

    /** Refuses a design MJML can't lay out, or a subject or design with a broken merge tag. */
    private async checkCompiles(design: TemplateDesign, subject: string, preheader: string | undefined): Promise<void> {
        checkMergeTags(subject, await compileDesign(design, preheader));
    }

    protected override async toViews(records: EmailTemplate[]): Promise<EmailTemplateView[]> {
        return records.map((record) => ({ ...JSON.parse(JSON.stringify(record)), hasUnsubscribeLink: hasUnsubscribeLink(record.design as TemplateDesign) }));
    }

    @Get("/:workspaceUid/merge-tags")
    public async mergeTags(@Param("workspaceUid") workspaceUid: string, @AuthUser user?: JWTUser): Promise<{ tag: string; label: string }[]> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        const definitions: PropertyDefinition[] = await (await this.repo<PropertyDefinition>("propertyDefinition")).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), sort: { key: "ASC" } },
            { ignoreACL: true, limit: 1000, skipCache: true },
        );
        return [
            ...MERGE_TAGS,
            ...definitions.map((definition) => ({
                tag: `${definition.objectType === "contact" ? "contact" : "company"}.properties.${definition.key}`,
                label: `${definition.label} (${definition.objectType})`,
            })),
        ];
    }

    @Post("/:workspaceUid/render")
    public async render(@Param("workspaceUid") workspaceUid: string, body: unknown, @AuthUser user?: JWTUser): Promise<RenderedEmail> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.READ);
        const request: Record<string, unknown> = requireObject(body);
        // A preview is never stored or sent, so hand-written HTML (sanitized) may be previewed by anyone who can read the workspace.
        const design: TemplateDesign = validateDesign(request.design, { allowHtml: true, sanitizeText, sanitizeHtml: sanitizeBlockHtml });
        const subject: string = readText(request, "subject", { max: 998 }) ?? "";
        const preheader: string | undefined = readText(request, "preheader", { max: 500 }) ?? undefined;
        const workspace = await this.requireWorkspaceRecord(workspaceUid);
        const compiled: string = await compileDesign(design, preheader);
        checkMergeTags(subject, compiled);
        return await renderEmail(compiled, subject, await this.mergeContextFor(workspace, request.contactUid));
    }

    @Post("/:workspaceUid/:uid/test")
    public async test(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, body: unknown, @AuthUser user?: JWTUser): Promise<{ sent: string }> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.WRITE);
        const request: Record<string, unknown> = requireObject(body);
        const template: EmailTemplate = await this.requireRecord(workspaceUid, uid);
        const to: string = readEmail(request, "to", { required: true })!;
        const mailboxes: Mailbox[] = await (await this.repo<Mailbox>("mailbox")).find(
            { primarySmtpAddress: ModelUtils.literal(to) },
            { ignoreACL: true, limit: 1, skipCache: true },
        );
        if (!mailboxes[0] || !(await hasMailAccess(this.aclUtils, this.trustedRoles, user, mailboxes[0].uid, ACLAction.READ))) {
            throw badRequest("A test can only be sent to the address of a mailbox you can read.");
        }
        const senderUid: string = await this.requireSender(workspaceUid, request.senderUid);
        const sender: WorkspaceSender = (await (await this.repo<WorkspaceSender>("workspaceSender")).findOne(senderUid, { ignoreACL: true }));
        const workspace = await this.requireWorkspaceRecord(workspaceUid);
        const context: MergeContext = await this.mergeContextFor(workspace, request.contactUid, sender);
        const compiled: string = await compileDesign(template.design as TemplateDesign, template.preheader ?? undefined);
        const email: RenderedEmail = await renderEmail(compiled, template.subject, context);
        try {
            await sendSystemMessage(this.mailTransport!, { sender, to, subject: `[Test] ${email.subject}`, text: email.text, html: email.html });
        } catch (err: any) {
            throw badRequest(`The test could not be sent: ${err?.message ?? err}`);
        }
        return { sent: to };
    }

    @Post("/:workspaceUid/:uid/duplicate")
    public async duplicate(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<EmailTemplateView> {
        await this.requireAccess(user, workspaceUid, WorkspaceAction.WRITE);
        const template: EmailTemplate = await this.requireRecord(workspaceUid, uid);
        return await this.create(
            workspaceUid,
            {
                name: `Copy of ${template.name}`.slice(0, 256),
                subject: template.subject,
                preheader: template.preheader ?? undefined,
                category: template.category ?? undefined,
                design: template.design,
            },
            user,
        );
    }
}

/** How long a saved block's name may be, and how many blocks it may hold. */
export const MAX_SAVED_BLOCKS = 20;

/** Reads the `blocks` of a saved block request, checked like a design's. */
export function readSavedBlocks(raw: unknown, allowHtml: boolean): DesignBlock[] {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SAVED_BLOCKS) {
        throw badRequest(`'blocks' must be a list of 1 to ${MAX_SAVED_BLOCKS} blocks.`);
    }
    const design: TemplateDesign = validateDesign(
        { sections: [{ columns: [{ blocks: raw }] }] },
        { allowHtml, sanitizeText, sanitizeHtml: sanitizeBlockHtml },
    );
    return design.sections[0].columns[0].blocks;
}

