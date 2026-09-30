///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import mjml2html from "mjml";
import { Liquid } from "liquidjs";
import { convert } from "html-to-text";
import { badRequest } from "../util/Validation.js";
import { DesignBlock, DesignSection, DesignTheme, SocialNetwork, TemplateDesign } from "./Design.js";
import { escapeKeepingTags } from "./Sanitize.js";

/** What a template's merge tags can read. Keys are snake_case, as merge tags are written (`{{ contact.first_name }}`). */
export interface MergeContext {
    contact: Record<string, unknown>;
    company?: Record<string, unknown>;
    workspace: { name: string; postal_address?: string; website?: string };
    sender?: { name: string; address: string };
    list?: { name: string };
    links: { unsubscribe: string; preferences: string; view_online?: string };
}

/** A rendered email. */
export interface RenderedEmail {
    subject: string;
    /** A complete HTML document. */
    html: string;
    text: string;
}

/** An attribute value for MJML: escaped, keeping merge tags. */
function attr(value: string | number): string {
    return escapeKeepingTags(String(value));
}

/** The attributes a block's alignment, padding and colour turn into. */
function common(block: { align?: string; padding?: number; color?: string }): string {
    return [block.align ? `align="${block.align}"` : "", block.padding !== undefined ? `padding="${block.padding}px"` : "", block.color ? `color="${block.color}"` : ""]
        .filter(Boolean)
        .join(" ");
}

const SOCIAL_NAMES: Record<SocialNetwork, string> = {
    facebook: "facebook",
    x: "x",
    linkedin: "linkedin",
    instagram: "instagram",
    youtube: "youtube",
    github: "github",
    web: "web",
};

/** One block as MJML. */
function blockMjml(block: DesignBlock, theme: DesignTheme): string {
    switch (block.type) {
        case "text":
            return `<mj-text ${common(block)} ${block.fontSize ? `font-size="${block.fontSize}px"` : ""}>${block.html}</mj-text>`;
        case "heading": {
            const size: number = block.level === 1 ? 28 : block.level === 2 ? 22 : 18;
            return `<mj-text ${common(block)} font-size="${size}px" font-weight="700" line-height="1.3"><h${block.level} style="margin:0;font-size:${size}px">${escapeKeepingTags(block.text)}</h${block.level}></mj-text>`;
        }
        case "image":
            return `<mj-image src="${attr(block.src)}" alt="${attr(block.alt)}" ${block.href ? `href="${attr(block.href)}"` : ""} ${block.width ? `width="${block.width}px"` : ""} ${common(block)} />`;
        case "button":
            return `<mj-button href="${attr(block.href)}" background-color="${block.backgroundColor ?? theme.buttonColor}" color="${block.color ?? theme.buttonTextColor}" border-radius="${block.borderRadius ?? 4}px" ${common({ ...block, color: undefined })}>${escapeKeepingTags(block.text)}</mj-button>`;
        case "divider":
            return `<mj-divider border-color="${block.color ?? "#e5e7eb"}" border-width="${block.thickness ?? 1}px" ${block.padding !== undefined ? `padding="${block.padding}px"` : ""} />`;
        case "spacer":
            return `<mj-spacer height="${block.height}px" />`;
        case "social":
            return `<mj-social mode="horizontal" ${block.align ? `align="${block.align}"` : ""}>${block.links
                .map((entry) => `<mj-social-element name="${SOCIAL_NAMES[entry.network]}" href="${attr(entry.href)}"></mj-social-element>`)
                .join("")}</mj-social>`;
        case "html":
            return `<mj-raw>${block.html}</mj-raw>`;
        default: {
            // footer
            const lines: string[] = [];
            if (block.note) {
                lines.push(`<p style="margin:0 0 8px">${escapeKeepingTags(block.note)}</p>`);
            }
            lines.push(
                `<p style="margin:0 0 8px">{{ workspace.name }}{% if workspace.postal_address %} &middot; {{ workspace.postal_address }}{% endif %}</p>`,
                `<p style="margin:0"><a href="{{ links.unsubscribe }}" style="color:inherit">Unsubscribe</a> &middot; <a href="{{ links.preferences }}" style="color:inherit">Email preferences</a></p>`,
            );
            return `<mj-text font-size="12px" ${common({ ...block, color: block.color ?? "#6b7280", align: block.align ?? "center" })}>${lines.join("")}</mj-text>`;
        }
    }
}

function sectionMjml(section: DesignSection, theme: DesignTheme): string {
    const attributes: string = [
        `background-color="${section.backgroundColor ?? theme.contentBackgroundColor}"`,
        section.padding !== undefined ? `padding="${section.padding}px 0"` : "",
    ].join(" ");
    const columns: string = section.columns
        .map((column) => `<mj-column>${column.blocks.map((block) => blockMjml(block, theme)).join("")}</mj-column>`)
        .join("");
    return `<mj-section ${attributes}>${columns}</mj-section>`;
}

/** A design as an MJML document; `preheader` becomes the inbox preview line. Merge tags are left in, for `renderEmail()`. */
export function designToMjml(design: TemplateDesign, preheader?: string): string {
    const { theme } = design;
    return [
        "<mjml>",
        "<mj-head>",
        `<mj-attributes><mj-all font-family="${attr(theme.fontFamily)}" /><mj-text color="${theme.textColor}" font-size="15px" line-height="1.5" /></mj-attributes>`,
        `<mj-style>a { color: ${theme.linkColor}; }</mj-style>`,
        preheader ? `<mj-preview>${escapeKeepingTags(preheader)}</mj-preview>` : "",
        "</mj-head>",
        `<mj-body background-color="${theme.backgroundColor}" width="${theme.width}px">`,
        ...design.sections.map((section) => sectionMjml(section, theme)),
        "</mj-body>",
        "</mjml>",
    ].join("");
}

/** The engine for HTML: everything a merge tag outputs is HTML-escaped. */
const htmlEngine: Liquid = new Liquid({ outputEscape: "escape", strictFilters: true, ownPropertyOnly: true, parseLimit: 2_000_000, renderLimit: 2000, memoryLimit: 20_000_000 });
/** The engine for the subject line, which is plain text. */
const textEngine: Liquid = new Liquid({ strictFilters: true, ownPropertyOnly: true, parseLimit: 10_000, renderLimit: 200, memoryLimit: 1_000_000 });

/** The HTML of a design (before merge tags are filled in), from MJML. Throws a 400 for a design MJML can't lay out. */
export async function compileDesign(design: TemplateDesign, preheader?: string): Promise<string> {
    const result = await mjml2html(designToMjml(design, preheader), { validationLevel: "soft", minify: false, keepComments: false });
    // MJML lays out any design `validateDesign()` accepts; this guards against a future MJML refusing one.
    /* v8 ignore if */
    if (!result.html) {
        throw badRequest("The design could not be laid out as an email.");
    }
    return result.html;
}

/**
 * Checks that a subject and a compiled design parse as Liquid, so a template with a broken merge tag is refused when saved rather than
 * when sent. A 400 names what's wrong.
 */
export function checkMergeTags(subject: string, compiledHtml: string): void {
    try {
        textEngine.parse(subject);
    } catch (err: any) {
        throw badRequest(`The subject has a broken merge tag: ${String(err?.message ?? err).split("\n")[0]}`);
    }
    try {
        htmlEngine.parse(compiledHtml);
    } catch (err: any) {
        throw badRequest(`The email has a broken merge tag: ${String(err?.message ?? err).split("\n")[0]}`);
    }
}

/**
 * The email for one reader: the compiled design and the subject with their merge tags filled in from `context` (HTML-escaped in the
 * body), and a plain-text part made from the result.
 */
export async function renderEmail(compiledHtml: string, subject: string, context: MergeContext): Promise<RenderedEmail> {
    const html: string = await htmlEngine.parseAndRender(compiledHtml, context);
    const renderedSubject: string = (await textEngine.parseAndRender(subject, context)).replace(/[\r\n]+/g, " ").trim();
    const text: string = convert(html, {
        wordwrap: 100,
        selectors: [
            { selector: "img", format: "skip" },
            { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
        ],
    });
    return { subject: renderedSubject, html, text };
}

/** A made-up reader, for previews without a contact. */
export function sampleContext(workspace: MergeContext["workspace"], sender?: MergeContext["sender"]): MergeContext {
    return {
        contact: { email: "jane.doe@example.com", first_name: "Jane", last_name: "Doe", full_name: "Jane Doe", job_title: "Head of Marketing", properties: {} },
        company: { name: "Example Inc", domain: "example.com", properties: {} },
        workspace,
        sender,
        links: { unsubscribe: "#unsubscribe", preferences: "#preferences" },
    };
}
