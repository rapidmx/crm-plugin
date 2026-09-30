///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { validateDesign, starterDesign, hasUnsubscribeLink, designBlocks, TemplateDesign } from "../../src/templates/Design.js";
import { buildMergeContext } from "../../src/templates/MergeContext.js";
import { checkMergeTags, compileDesign, designToMjml, renderEmail, sampleContext } from "../../src/templates/Render.js";
import { escapeKeepingTags, restoreMergeTags, sanitizeBlockHtml, sanitizeText } from "../../src/templates/Sanitize.js";

const check = { allowHtml: true, sanitizeText, sanitizeHtml: sanitizeBlockHtml };
const design = (blocks: unknown[]): TemplateDesign => validateDesign({ sections: [{ columns: [{ blocks }] }] }, check);

describe("Sanitize", () => {
    it("restores quotes inside merge tags only", () => {
        expect(restoreMergeTags("&quot;{{ x | default: &#39;a&#39; }}&quot; {% if a &amp;&amp; b %}")).toBe('&quot;{{ x | default: \'a\' }}&quot; {% if a && b %}');
    });

    it("escapes text but keeps merge tags, minus angle brackets", () => {
        expect(escapeKeepingTags(`<a & "b" 'c'> {{ x<y> }}`)).toBe("&lt;a &amp; &quot;b&quot; &#39;c&#39;&gt; {{ xy }}");
    });

    it("unlinks links with no or unsafe targets, keeping their text", () => {
        expect(sanitizeText('<a>none</a> <a href="data:x">data</a> <a href="mailto:a@x.example">mail</a> <a href="tel:+1">tel</a>')).toBe(
            '<span>none</span> <span>data</span> <a href="mailto:a@x.example">mail</a> <a href="tel:+1">tel</a>',
        );
        expect(sanitizeText('<p style="color:#123;position:fixed;text-align:center">x</p>')).toBe('<p style="color:#123;text-align:center">x</p>');
        expect(sanitizeBlockHtml('<img src="https://x.example/a.png" onerror="x()"><a href="javascript:x()">y</a>')).toBe(
            '<img src="https://x.example/a.png" /><span>y</span>',
        );
    });
});

describe("Design", () => {
    it("fills in defaults and ids, and finds the unsubscribe link", () => {
        const starter: TemplateDesign = starterDesign();
        expect(hasUnsubscribeLink(starter)).toBe(true);
        const checked = design([{ type: "heading", text: "Hi" }, { type: "text", html: '<p><a href="{{ links.unsubscribe }}">Leave</a></p>' }]);
        expect(designBlocks(checked).map((block) => block.type)).toEqual(["heading", "text"]);
        expect(designBlocks(checked)[0]).toMatchObject({ level: 1 });
        expect(hasUnsubscribeLink(checked)).toBe(true);
        expect(hasUnsubscribeLink(design([{ type: "text", html: "<p>x</p>" }]))).toBe(false);
    });

    it("accepts merge tags inside links, and links that are a merge tag", () => {
        expect(designBlocks(design([{ type: "button", text: "Go", href: "https://x.example/a%20b?e={{ contact.email }}&n={{contact.first_name}}" }]))[0]).toMatchObject({
            href: "https://x.example/a%20b?e={{ contact.email }}&n={{contact.first_name}}",
        });
        expect(designBlocks(design([{ type: "button", text: "Go", href: "{{ links.preferences }}#top" }]))[0]).toMatchObject({ href: "{{ links.preferences }}#top" });
        for (const href of ["https://x.example/{{ a | b }}", "https://x.example/{% if a %}", "{{ a }} b", "https://" + "x".repeat(2050)]) {
            expect(() => design([{ type: "button", text: "Go", href }])).toThrow(/link/);
        }
    });
});

describe("Render", () => {
    const workspace = { name: "Acme", postal_address: "1 Main St" };

    it("lays out each kind of block, with and without its options", async () => {
        const mjml: string = designToMjml(
            design([
                { type: "heading", text: "One", level: 1 },
                { type: "heading", text: "Three", level: 3 },
                { type: "image", src: "https://x.example/a.png" },
                { type: "divider" },
                { type: "social", links: [{ network: "github", href: "https://github.com/x" }] },
                { type: "html", html: "<p>Raw</p>" },
            ]),
        );
        expect(mjml).toContain('font-size="28px"');
        expect(mjml).toContain('<h3 style="margin:0;font-size:18px">Three</h3>');
        expect(mjml).toContain('alt=""');
        expect(mjml).toContain('border-color="#e5e7eb" border-width="1px"');
        expect(mjml).toContain('<mj-social mode="horizontal" >');
        expect(mjml).toContain("<mj-raw><p>Raw</p></mj-raw>");
        expect(mjml).not.toContain("mj-preview");
        const html: string = await compileDesign(starterDesign(), "Preview line");
        expect(html).toContain("Preview line");
        expect(html).toContain("{{ links.unsubscribe }}");
    });

    it("refuses broken merge tags in the subject and body", () => {
        expect(() => checkMergeTags("{{ x", "")).toThrow(/subject has a broken merge tag/);
        expect(() => checkMergeTags("x", "{% if %}")).toThrow(/email has a broken merge tag/);
        expect(() => checkMergeTags("{{ x | upcase }}", "{{ y }}")).not.toThrow();
    });

    it("fills in merge tags, escaping them in the body only, and makes a text part", async () => {
        const email = await renderEmail('<p>Hi {{ contact.first_name }}</p><img src="https://x/a.png"><a href="https://x.example">https://x.example</a>', "Hi\r\n{{ contact.first_name }}", {
            ...sampleContext(workspace),
            contact: { first_name: "<Ann>" },
        });
        expect(email.subject).toBe("Hi <Ann>");
        expect(email.html).toContain("Hi &lt;Ann&gt;");
        expect(email.text).toBe("Hi <Ann>\n\nhttps://x.example");
        expect(sampleContext(workspace, { name: "Bo", address: "bo@x.example" }).sender).toEqual({ name: "Bo", address: "bo@x.example" });
    });
});

describe("buildMergeContext", () => {
    it("fills blanks for missing fields", () => {
        const context = buildMergeContext({
            workspace: { uid: "w", name: "Acme" } as any,
            contact: { uid: "c", email: "a@x.example", lifecycleStage: "lead", score: 0, tags: [] } as any,
            contactDefinitions: [],
            companyDefinitions: [],
            links: { unsubscribe: "u", preferences: "p" },
        });
        expect(context.contact).toMatchObject({ first_name: "", last_name: "", full_name: "", phone: "", job_title: "" });
        expect(context.company).toBeUndefined();
        expect(context.sender).toBeUndefined();
        expect(context.workspace).toEqual({ name: "Acme", postal_address: undefined, website: undefined });

        const full = buildMergeContext({
            workspace: { uid: "w", name: "Acme", postalAddress: "1 Main St", website: "https://acme.example" } as any,
            contact: { uid: "c", email: "a@x.example", firstName: "Ann", lastName: "Lee", phone: "1", jobTitle: "CEO", tags: [] } as any,
            contactDefinitions: [],
            company: { uid: "co", name: "Acme", domain: "acme.example", industry: "x", website: "w", city: "c", country: "US" } as any,
            companyDefinitions: [],
            sender: { fromName: "Bo", fromAddress: "bo@x.example" } as any,
            list: { name: "News" },
            links: { unsubscribe: "u", preferences: "p" },
        });
        expect(full.contact.full_name).toBe("Ann Lee");
        expect(full.company).toMatchObject({ name: "Acme", domain: "acme.example", country: "US" });
        expect(full.sender).toEqual({ name: "Bo", address: "bo@x.example" });
        expect(full.list).toEqual({ name: "News" });
    });
});
