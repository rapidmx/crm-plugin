///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import * as crypto from "crypto";
import { badRequest, isObject } from "../util/Validation.js";

/** The look every part of a design falls back to. */
export interface DesignTheme {
    /** Around the email. */
    backgroundColor: string;
    /** Behind the content. */
    contentBackgroundColor: string;
    fontFamily: string;
    textColor: string;
    linkColor: string;
    buttonColor: string;
    buttonTextColor: string;
    /** The content's width in pixels (480-800). */
    width: number;
}

export type Align = "left" | "center" | "right";

interface BlockBase {
    /** Server-assigned when missing; stable across edits, so the editor can track blocks. */
    id: string;
    /** Padding around the block in pixels. */
    padding?: number;
}

export interface TextBlock extends BlockBase {
    type: "text";
    /** Formatted text: paragraphs, bold, italics, underline, links, lists, line breaks - sanitized on save. */
    html: string;
    align?: Align;
    fontSize?: number;
    color?: string;
}

export interface HeadingBlock extends BlockBase {
    type: "heading";
    text: string;
    level: 1 | 2 | 3;
    align?: Align;
    color?: string;
}

export interface ImageBlock extends BlockBase {
    type: "image";
    /** An https:// image. */
    src: string;
    alt: string;
    /** Where clicking the image goes. */
    href?: string;
    /** In pixels; the column's width when unset. */
    width?: number;
    align?: Align;
}

export interface ButtonBlock extends BlockBase {
    type: "button";
    text: string;
    href: string;
    align?: Align;
    backgroundColor?: string;
    color?: string;
    borderRadius?: number;
}

export interface DividerBlock extends BlockBase {
    type: "divider";
    color?: string;
    thickness?: number;
}

export interface SpacerBlock extends BlockBase {
    type: "spacer";
    height: number;
}

export type SocialNetwork = "facebook" | "x" | "linkedin" | "instagram" | "youtube" | "github" | "web";

export interface SocialBlock extends BlockBase {
    type: "social";
    links: { network: SocialNetwork; href: string }[];
    align?: Align;
}

/** Hand-written HTML. Only workspace admins may add or change one; it is still sanitized. */
export interface HtmlBlock extends BlockBase {
    type: "html";
    html: string;
}

/** The marketing footer: the workspace's name and postal address, and the unsubscribe and preferences links. */
export interface FooterBlock extends BlockBase {
    type: "footer";
    /** Text above the links, e.g. why the reader gets the email. */
    note?: string;
    align?: Align;
    color?: string;
}

export type DesignBlock = TextBlock | HeadingBlock | ImageBlock | ButtonBlock | DividerBlock | SpacerBlock | SocialBlock | HtmlBlock | FooterBlock;
export type BlockType = DesignBlock["type"];

export interface DesignColumn {
    id: string;
    blocks: DesignBlock[];
}

export interface DesignSection {
    id: string;
    backgroundColor?: string;
    padding?: number;
    /** 1 to 4 columns, side by side (stacked on a phone). */
    columns: DesignColumn[];
}

/** An email design: a theme, and sections of columns of blocks. Stored as JSON on the template, rendered with MJML. */
export interface TemplateDesign {
    version: 1;
    theme: DesignTheme;
    sections: DesignSection[];
}

export const DEFAULT_THEME: DesignTheme = {
    backgroundColor: "#f3f4f6",
    contentBackgroundColor: "#ffffff",
    fontFamily: "Arial, Helvetica, sans-serif",
    textColor: "#111827",
    linkColor: "#2563eb",
    buttonColor: "#2563eb",
    buttonTextColor: "#ffffff",
    width: 600,
};

/** How big a design may get. */
export const MAX_SECTIONS = 60;
export const MAX_BLOCKS_PER_COLUMN = 40;
export const MAX_BLOCKS = 400;
export const MAX_DESIGN_BYTES = 512 * 1024;

const COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FONT = /^[A-Za-z0-9 ,'"-]{1,120}$/;
const ALIGNS: readonly Align[] = ["left", "center", "right"];
const NETWORKS: readonly SocialNetwork[] = ["facebook", "x", "linkedin", "instagram", "youtube", "github", "web"];
/** A link a design may use: web, mail or phone - or one that is a merge tag (`{{ links.unsubscribe }}`), filled in per contact. */
const LINK = /^(?:(?:https?:\/\/|mailto:|tel:)(?:[^\s"<>{}]|\{\}){1,2040}|\{\}(?:[^\s"<>{}]|\{\}){0,500})$/i;
/** A simple merge tag (`{{ contact.email }}`), the only kind a link may hold. */
const LINK_TAG = /\{\{\s*[a-z_][a-z0-9_.]*\s*\}\}/gi;
const IMAGE = /^https:\/\/[^\s"<>]{1,2040}$/i;

/** A new id for a design part. */
export function newId(): string {
    return crypto.randomUUID();
}

/** What a design check needs to know. */
export interface DesignCheck {
    /** The caller may add or change hand-written HTML blocks. */
    allowHtml: boolean;
    /** The blocks of the design being replaced, by id: an HTML block unchanged from there is kept even when `allowHtml` is off. */
    previous?: Map<string, DesignBlock>;
    /** Makes a block's formatted text safe (`templates/Sanitize.ts`), and a hand-written HTML block's HTML. */
    sanitizeText: (html: string) => string;
    sanitizeHtml: (html: string) => string;
}

function text(raw: unknown, where: string, max: number, required: boolean = true): string {
    if (typeof raw !== "string" || (required && raw.trim().length === 0) || raw.length > max) {
        throw badRequest(`${where} must be text of ${required ? 1 : 0} to ${max} characters.`);
    }
    return raw;
}

function optional<T>(raw: unknown, check: (value: unknown) => T): T | undefined {
    return raw === undefined || raw === null ? undefined : check(raw);
}

function color(where: string) {
    return (raw: unknown): string => {
        if (typeof raw !== "string" || !COLOR.test(raw)) {
            throw badRequest(`${where} must be a colour such as #336699.`);
        }
        return raw;
    };
}

function integer(where: string, min: number, max: number) {
    return (raw: unknown): number => {
        if (typeof raw !== "number" || !Number.isInteger(raw) || raw < min || raw > max) {
            throw badRequest(`${where} must be a whole number from ${min} to ${max}.`);
        }
        return raw;
    };
}

function align(where: string) {
    return (raw: unknown): Align => {
        if (!ALIGNS.includes(raw as Align)) {
            throw badRequest(`${where} must be left, center or right.`);
        }
        return raw as Align;
    };
}

function link(where: string) {
    return (raw: unknown): string => {
        // Each simple merge tag counts as `{}` (at the start, a link's whole target), so its spaces don't make a link
        // invalid; any other brace is refused.
        if (typeof raw !== "string" || raw.length > 2048 || !LINK.test(raw.trim().replace(LINK_TAG, "{}"))) {
            throw badRequest(`${where} must be an http(s), mailto: or tel: link, or a merge tag.`);
        }
        return raw.trim();
    };
}

function id(raw: unknown): string {
    return typeof raw === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : newId();
}

/** One block, checked and normalized. */
function readBlock(raw: unknown, where: string, check: DesignCheck): DesignBlock {
    if (!isObject(raw)) {
        throw badRequest(`${where} must be an object.`);
    }
    const base = { id: id(raw.id), ...(raw.padding !== undefined ? { padding: integer(`${where}'s padding`, 0, 120)(raw.padding) } : {}) };
    switch (raw.type) {
        case "text":
            return {
                ...base,
                type: "text",
                html: check.sanitizeText(text(raw.html, `${where}'s text`, 100000, false)),
                align: optional(raw.align, align(`${where}'s alignment`)),
                fontSize: optional(raw.fontSize, integer(`${where}'s font size`, 8, 72)),
                color: optional(raw.color, color(`${where}'s colour`)),
            };
        case "heading":
            return {
                ...base,
                type: "heading",
                text: text(raw.text, `${where}'s text`, 500),
                level: (optional(raw.level, integer(`${where}'s level`, 1, 3)) ?? 1) as 1 | 2 | 3,
                align: optional(raw.align, align(`${where}'s alignment`)),
                color: optional(raw.color, color(`${where}'s colour`)),
            };
        case "image": {
            if (typeof raw.src !== "string" || !IMAGE.test(raw.src.trim())) {
                throw badRequest(`${where}'s image must be an https:// address.`);
            }
            return {
                ...base,
                type: "image",
                src: raw.src.trim(),
                alt: text(raw.alt ?? "", `${where}'s alternative text`, 500, false),
                href: optional(raw.href, link(`${where}'s link`)),
                width: optional(raw.width, integer(`${where}'s width`, 16, 800)),
                align: optional(raw.align, align(`${where}'s alignment`)),
            };
        }
        case "button":
            return {
                ...base,
                type: "button",
                text: text(raw.text, `${where}'s label`, 200),
                href: link(`${where}'s link`)(raw.href),
                align: optional(raw.align, align(`${where}'s alignment`)),
                backgroundColor: optional(raw.backgroundColor, color(`${where}'s colour`)),
                color: optional(raw.color, color(`${where}'s text colour`)),
                borderRadius: optional(raw.borderRadius, integer(`${where}'s rounding`, 0, 50)),
            };
        case "divider":
            return {
                ...base,
                type: "divider",
                color: optional(raw.color, color(`${where}'s colour`)),
                thickness: optional(raw.thickness, integer(`${where}'s thickness`, 1, 20)),
            };
        case "spacer":
            return { ...base, type: "spacer", height: integer(`${where}'s height`, 1, 400)(raw.height) };
        case "social": {
            if (!Array.isArray(raw.links) || raw.links.length === 0 || raw.links.length > 10) {
                throw badRequest(`${where} needs 1 to 10 links.`);
            }
            return {
                ...base,
                type: "social",
                links: raw.links.map((entry: unknown, index: number) => {
                    if (!isObject(entry) || !NETWORKS.includes(entry.network as SocialNetwork)) {
                        throw badRequest(`${where}'s link ${index + 1} must name one of: ${NETWORKS.join(", ")}.`);
                    }
                    return { network: entry.network as SocialNetwork, href: link(`${where}'s link ${index + 1}`)(entry.href) };
                }),
                align: optional(raw.align, align(`${where}'s alignment`)),
            };
        }
        case "html": {
            const html: string = text(raw.html, `${where}'s HTML`, 200000, false);
            const previous: DesignBlock | undefined = check.previous?.get(base.id);
            const unchanged: boolean = previous?.type === "html" && previous.html === check.sanitizeHtml(html);
            if (!check.allowHtml && !unchanged) {
                throw badRequest("Only workspace admins can add or change HTML blocks.");
            }
            return { ...base, type: "html", html: check.sanitizeHtml(html) };
        }
        case "footer":
            return {
                ...base,
                type: "footer",
                note: optional(raw.note, (value) => text(value, `${where}'s note`, 2000, false)),
                align: optional(raw.align, align(`${where}'s alignment`)),
                color: optional(raw.color, color(`${where}'s colour`)),
            };
        default:
            throw badRequest(`${where} has an unknown type: ${JSON.stringify(raw.type)}.`);
    }
}

/** Every block of a design, in order. */
export function designBlocks(design: TemplateDesign): DesignBlock[] {
    return design.sections.flatMap((section) => section.columns.flatMap((column) => column.blocks));
}

/**
 * A design from a request, checked and normalized: every part has an id (a missing or malformed one gets a new one), every value is
 * within its limits, colours are colours, links are web, mail or phone links or merge tags, images are https, text is sanitized, and
 * hand-written HTML only comes from someone allowed to write it. Undefined optional values are dropped. A bad design is a 400 naming
 * the part at fault.
 */
export function validateDesign(raw: unknown, check: DesignCheck): TemplateDesign {
    if (!isObject(raw)) {
        throw badRequest("'design' must be an object.");
    }
    if (JSON.stringify(raw).length > MAX_DESIGN_BYTES) {
        throw badRequest(`A design may be at most ${MAX_DESIGN_BYTES / 1024} KB.`);
    }
    const themeRaw: Record<string, unknown> = isObject(raw.theme) ? raw.theme : {};
    const theme: DesignTheme = {
        backgroundColor: color("The background colour")(themeRaw.backgroundColor ?? DEFAULT_THEME.backgroundColor),
        contentBackgroundColor: color("The content background colour")(themeRaw.contentBackgroundColor ?? DEFAULT_THEME.contentBackgroundColor),
        fontFamily: (() => {
            const value: unknown = themeRaw.fontFamily ?? DEFAULT_THEME.fontFamily;
            if (typeof value !== "string" || !FONT.test(value)) {
                throw badRequest("The font must be a list of font names.");
            }
            return value;
        })(),
        textColor: color("The text colour")(themeRaw.textColor ?? DEFAULT_THEME.textColor),
        linkColor: color("The link colour")(themeRaw.linkColor ?? DEFAULT_THEME.linkColor),
        buttonColor: color("The button colour")(themeRaw.buttonColor ?? DEFAULT_THEME.buttonColor),
        buttonTextColor: color("The button text colour")(themeRaw.buttonTextColor ?? DEFAULT_THEME.buttonTextColor),
        width: integer("The width", 480, 800)(themeRaw.width ?? DEFAULT_THEME.width),
    };
    if (!Array.isArray(raw.sections) || raw.sections.length > MAX_SECTIONS) {
        throw badRequest(`'design.sections' must be a list of at most ${MAX_SECTIONS} sections.`);
    }
    let blockCount: number = 0;
    const sections: DesignSection[] = raw.sections.map((sectionRaw: unknown, sectionIndex: number) => {
        const where: string = `Section ${sectionIndex + 1}`;
        if (!isObject(sectionRaw) || !Array.isArray(sectionRaw.columns) || sectionRaw.columns.length < 1 || sectionRaw.columns.length > 4) {
            throw badRequest(`${where} must have 1 to 4 columns.`);
        }
        const section: DesignSection = {
            id: id(sectionRaw.id),
            columns: sectionRaw.columns.map((columnRaw: unknown, columnIndex: number) => {
                const columnWhere: string = `${where}, column ${columnIndex + 1}`;
                if (!isObject(columnRaw) || !Array.isArray(columnRaw.blocks) || columnRaw.blocks.length > MAX_BLOCKS_PER_COLUMN) {
                    throw badRequest(`${columnWhere} must have a list of at most ${MAX_BLOCKS_PER_COLUMN} blocks.`);
                }
                blockCount += columnRaw.blocks.length;
                return {
                    id: id(columnRaw.id),
                    blocks: columnRaw.blocks.map((blockRaw: unknown, blockIndex: number) => readBlock(blockRaw, `${columnWhere}, block ${blockIndex + 1}`, check)),
                };
            }),
        };
        if (sectionRaw.backgroundColor !== undefined && sectionRaw.backgroundColor !== null) {
            section.backgroundColor = color(`${where}'s background`)(sectionRaw.backgroundColor);
        }
        if (sectionRaw.padding !== undefined && sectionRaw.padding !== null) {
            section.padding = integer(`${where}'s padding`, 0, 120)(sectionRaw.padding);
        }
        return section;
    });
    if (blockCount > MAX_BLOCKS) {
        throw badRequest(`A design may have at most ${MAX_BLOCKS} blocks.`);
    }
    return JSON.parse(JSON.stringify({ version: 1, theme, sections }));
}

/** Whether a design lets its reader unsubscribe: a footer block, or a link to `{{ links.unsubscribe }}` anywhere. */
export function hasUnsubscribeLink(design: TemplateDesign): boolean {
    return designBlocks(design).some(
        (block) =>
            block.type === "footer" ||
            ((block.type === "text" || block.type === "html") && /\{\{\s*links\.unsubscribe\s*\}\}/.test(block.html)) ||
            (block.type === "button" && /\{\{\s*links\.unsubscribe\s*\}\}/.test(block.href)),
    );
}

/** The design a new template starts from: a heading, a paragraph, a button and the footer. */
export function starterDesign(): TemplateDesign {
    const block = (value: Record<string, unknown>): DesignBlock => ({ id: newId(), ...value }) as DesignBlock;
    return {
        version: 1,
        theme: { ...DEFAULT_THEME },
        sections: [
            {
                id: newId(),
                padding: 24,
                columns: [
                    {
                        id: newId(),
                        blocks: [
                            block({ type: "heading", text: "Hello {{ contact.first_name | default: 'there' }}", level: 1 }),
                            block({ type: "text", html: "<p>Write your message here.</p>" }),
                            block({ type: "button", text: "Learn more", href: "https://example.com" }),
                        ],
                    },
                ],
            },
            { id: newId(), padding: 16, columns: [{ id: newId(), blocks: [block({ type: "footer" })] }] },
        ],
    };
}
