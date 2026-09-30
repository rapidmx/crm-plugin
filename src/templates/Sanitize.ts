///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import sanitizeHtml from "sanitize-html";

/** Merge tags (`{{ contact.first_name }}`) and Liquid tags (`{% if ... %}`) in a piece of HTML or text. */
const TAGS = /(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\})/g;

/** The entities an escaper puts inside a merge tag that Liquid needs back as characters. */
const ENTITIES: Record<string, string> = { "&quot;": '"', "&#34;": '"', "&#39;": "'", "&#x27;": "'", "&apos;": "'", "&amp;": "&" };

/**
 * `html` with the quote and ampersand entities inside its merge and Liquid tags turned back into characters: `{{ x | default: &#39;a&#39; }}`
 * becomes `{{ x | default: 'a' }}`, which Liquid can parse. Nothing outside the tags changes, and `<`/`>` stay escaped everywhere.
 */
export function restoreMergeTags(html: string): string {
    return html.replace(TAGS, (tag) => tag.replace(/&quot;|&#34;|&#39;|&#x27;|&apos;|&amp;/g, (entity) => ENTITIES[entity]));
}

/** Escapes text for HTML, except inside merge and Liquid tags (which only lose `<` and `>`, never valid in them). */
export function escapeKeepingTags(text: string): string {
    return text
        .split(TAGS)
        .map((part, index) =>
            index % 2 === 1
                ? part.replace(/[<>]/g, "")
                : part.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
        )
        .join("");
}

/** Keeps a link to the web, mail or a phone, or one that is a merge tag; anything else (`javascript:`, `data:`...) is dropped. */
function safeHref(href: string | undefined): boolean {
    const value: string = (href ?? "").trim();
    return /^(?:https?:|mailto:|tel:)/i.test(value) || /^\{\{\s*[a-z_][a-z0-9_.]*\s*\}\}/i.test(value);
}

/** A link with an unsafe target becomes plain text (a bare `<span>`), keeping what it says. */
function unlinkUnsafe(tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
    return safeHref(attribs.href) ? { tagName, attribs } : { tagName: "span", attribs: {} };
}

const TEXT_OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "span", "blockquote", "h1", "h2", "h3"],
    allowedAttributes: { a: ["href", "target", "rel"], span: ["style"], p: ["style"] },
    allowedStyles: {
        "*": {
            color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i],
            "text-align": [/^(?:left|right|center|justify)$/],
            "font-weight": [/^(?:bold|normal|\d{3})$/],
        },
    },
    // Links are checked by `unlinkUnsafe()`, so merge-tag links (which have no scheme) survive.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    transformTags: { a: unlinkUnsafe },
};

/**
 * The formatted text of a text block, made safe: the formatting the editor produces (paragraphs, bold, italics, underline,
 * strike-through, links, lists, quotes, small headings, colour and alignment) and nothing else - no scripts, no styles beyond
 * those, and links only to the web, mail, phones or merge tags. Merge tags stay usable (`restoreMergeTags()`).
 */
export function sanitizeText(html: string): string {
    return restoreMergeTags(sanitizeHtml(html, TEXT_OPTIONS));
}

const HTML_OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: [
        ...TEXT_OPTIONS.allowedTags as string[],
        "div",
        "table",
        "thead",
        "tbody",
        "tfoot",
        "tr",
        "td",
        "th",
        "img",
        "hr",
        "h4",
        "h5",
        "h6",
        "center",
        "small",
        "sup",
        "sub",
        "code",
        "pre",
    ],
    allowedAttributes: {
        "*": ["style", "align", "width", "height", "bgcolor", "valign", "border", "cellpadding", "cellspacing", "class", "role"],
        a: ["href", "target", "rel", "style", "title"],
        img: ["src", "alt", "width", "height", "style", "title"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
    transformTags: { a: unlinkUnsafe },
};

/**
 * A hand-written HTML block's HTML, made safe: layout and formatting HTML (tables, images, inline styles) is kept; scripts, forms,
 * frames, event handlers and `javascript:` links are removed, and images must be https. Merge tags stay usable.
 */
export function sanitizeBlockHtml(html: string): string {
    return restoreMergeTags(sanitizeHtml(html, HTML_OPTIONS));
}
