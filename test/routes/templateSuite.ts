///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Email templates and saved blocks - identical on both backends.
import { CrmTestContext, call, setUpWorkspace } from "./context.js";

export function templateSuite(ctx: CrmTestContext): void {
    describe("templates", () => {
        let workspaceUid: string;
        const path = (suffix: string = "") => `/templates/${workspaceUid}${suffix}`;
        const textBlock = (html: string) => ({ type: "text", html });
        const design = (blocks: unknown[], extra: Record<string, unknown> = {}) => ({ theme: { buttonColor: "#ff0000" }, sections: [{ columns: [{ blocks }] }], ...extra });

        beforeEach(async () => {
            workspaceUid = await setUpWorkspace(ctx);
            await call(ctx, "put", `/workspaces/${workspaceUid}`, ctx.users.owner, { postalAddress: "1 Main St, Springfield" });
            ctx.transport().sent = [];
        });

        it("creates a template from the starter design, and changes, duplicates and deletes it", async () => {
            const created = await call(ctx, "post", path(), ctx.users.editor, { name: "Welcome", subject: "Welcome, {{ contact.first_name }}" });
            expect(created.status).toBe(200);
            expect(created.body).toMatchObject({ name: "Welcome", hasUnsubscribeLink: true });
            expect(created.body.design.sections).toHaveLength(2);
            expect(created.body.design.sections[0].columns[0].blocks.map((block: any) => block.type)).toEqual(["heading", "text", "button"]);

            const updated = await call(ctx, "put", path(`/${created.body.uid}`), ctx.users.editor, {
                preheader: "Hi there",
                category: "welcome",
                design: design([textBlock("<p>No footer</p>")]),
            });
            expect(updated.body).toMatchObject({ preheader: "Hi there", category: "welcome", hasUnsubscribeLink: false });
            expect(updated.body.design.theme).toMatchObject({ buttonColor: "#ff0000", width: 600 });
            expect(updated.body.design.sections[0].id).toMatch(/^[0-9a-f-]{36}$/);

            const copy = await call(ctx, "post", path(`/${created.body.uid}/duplicate`), ctx.users.editor);
            expect(copy.body).toMatchObject({ name: "Copy of Welcome", subject: "Welcome, {{ contact.first_name }}", preheader: "Hi there" });
            expect((await call(ctx, "delete", path(`/${created.body.uid}`), ctx.users.editor)).status).toBe(204);
            expect((await call(ctx, "get", path(), ctx.users.viewer)).body.map((template: any) => template.name)).toEqual(["Copy of Welcome"]);
            expect((await call(ctx, "post", path(), ctx.users.viewer, { name: "x", subject: "y" })).status).toBe(403);
        });

        it("sanitizes text and hand-written HTML, and lets only admins write HTML blocks", async () => {
            const created = await call(ctx, "post", path(), ctx.users.owner, {
                name: "Promo",
                subject: "Sale",
                design: design([
                    textBlock('<p onclick="x()">Hi <script>alert(1)</script><a href="javascript:alert(1)">bad</a> <a href="{{ links.preferences }}">prefs</a></p>'),
                    { type: "html", html: '<table><tr><td style="color:red">Cell</td></tr></table><iframe src="https://x.example"></iframe><img src="http://x.example/a.png">' },
                    { type: "footer", note: "You signed up at acme.example" },
                ]),
            });
            expect(created.status).toBe(200);
            const [text, html] = created.body.design.sections[0].columns[0].blocks;
            expect(text.html).toBe('<p>Hi <span>bad</span> <a href="{{ links.preferences }}">prefs</a></p>');
            expect(html.html).toContain('<td style="color:red">Cell</td>');
            expect(html.html).not.toContain("iframe");
            expect(html.html).not.toContain("http://x.example");

            // An editor may keep an admin's HTML block as it is, but not change it or add one.
            const blocks = created.body.design.sections[0].columns[0].blocks;
            const keep = await call(ctx, "put", path(`/${created.body.uid}`), ctx.users.editor, { design: design([...blocks, textBlock("<p>More</p>")]) });
            expect(keep.status).toBe(200);
            const changed = await call(ctx, "put", path(`/${created.body.uid}`), ctx.users.editor, { design: design([blocks[0], { ...blocks[1], html: "<p>Mine</p>" }]) });
            expect(changed.status).toBe(400);
            expect((await call(ctx, "post", path(), ctx.users.editor, { name: "x", subject: "y", design: design([{ type: "html", html: "<p>x</p>" }]) })).status).toBe(400);
        });

        it("refuses bad designs and broken merge tags", async () => {
            for (const bad of [
                "not a design",
                { sections: "x" },
                { sections: [{ columns: [] }] },
                { sections: [{ columns: [{ blocks: "x" }] }] },
                { sections: [{ columns: [{ blocks: [5] }] }] },
                design([{ type: "video" }]),
                design([{ type: "heading", text: "" }]),
                design([{ type: "heading", text: "Hi", level: 4 }]),
                design([{ type: "image", src: "http://x.example/a.png" }]),
                design([{ type: "image", src: "https://x.example/a.png", href: "javascript:alert(1)" }]),
                design([{ type: "button", text: "Go", href: "ftp://x" }]),
                design([{ type: "button", text: "Go", href: "https://x.example", backgroundColor: "red" }]),
                design([{ type: "spacer", height: 0 }]),
                design([{ type: "social", links: [] }]),
                design([{ type: "social", links: [{ network: "myspace", href: "https://x" }] }]),
                design([{ type: "text", html: "<p>x</p>", align: "middle" }]),
                design([{ type: "text", html: 5 }]),
                design([{ type: "footer", note: 5 }]),
                design([], { theme: { width: 300 } }),
                design([], { theme: { fontFamily: "x;}" } }),
                { theme: {}, sections: [{ columns: [{ blocks: [] }], backgroundColor: "blue" }] },
                { theme: {}, sections: [{ columns: [{ blocks: [] }], padding: 500 }] },
                design([textBlock("<p>{{ contact.first_name </p>")]),
            ]) {
                const result = await call(ctx, "post", path(), ctx.users.owner, { name: "x", subject: "y", design: bad });
                expect({ bad, status: result.status }).toEqual({ bad, status: 400 });
            }
            expect((await call(ctx, "post", path(), ctx.users.owner, { name: "x", subject: "{{ oops" })).status).toBe(400);
            expect((await call(ctx, "post", path(), ctx.users.owner, { name: "x" })).status).toBe(400);
            const template = (await call(ctx, "post", path(), ctx.users.owner, { name: "x", subject: "y" })).body;
            expect((await call(ctx, "put", path(`/${template.uid}`), ctx.users.owner, { subject: null })).status).toBe(400);
            expect((await call(ctx, "put", path(`/${template.uid}`), ctx.users.owner, { preheader: "{% if %}" })).status).toBe(400);
            expect((await call(ctx, "post", path(), ctx.users.owner, { name: "x", subject: "y", design: { sections: Array.from({ length: 61 }, () => ({ columns: [{ blocks: [] }] })) } })).status).toBe(400);
            const many = Array.from({ length: 41 }, () => ({ type: "spacer", height: 1 }));
            expect((await call(ctx, "post", path(), ctx.users.owner, { name: "x", subject: "y", design: design(many) })).status).toBe(400);
            const sections = Array.from({ length: 11 }, () => ({ columns: [{ blocks: Array.from({ length: 40 }, () => ({ type: "spacer", height: 1 })) }] }));
            expect((await call(ctx, "post", path(), ctx.users.owner, { name: "x", subject: "y", design: { sections } })).status).toBe(400);
            expect((await call(ctx, "post", path(), ctx.users.owner, { name: "x", subject: "y", design: design([textBlock("x".repeat(600 * 1024))]) })).status).toBe(400);
        });

        it("renders every kind of block for a contact, escaping merged values", async () => {
            await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, { objectType: "contact", key: "plan", label: "Plan", type: "text" });
            await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, { objectType: "company", key: "tier", label: "Tier", type: "text" });
            const company = (await call(ctx, "post", `/companies/${workspaceUid}`, ctx.users.editor, { name: "Acme <Corp>", properties: { tier: "gold" } })).body;
            const contact = (
                await call(ctx, "post", `/contacts/${workspaceUid}`, ctx.users.editor, { email: "ann@x.example", firstName: "<b>Ann</b>", companyUid: company.uid, properties: { plan: "pro" } })
            ).body;
            const rendered = await call(ctx, "post", path("/render"), ctx.users.viewer, {
                subject: "Hi {{ contact.first_name }} from {{ company.name }}",
                preheader: "About {{ contact.properties.plan }}",
                contactUid: contact.uid,
                design: {
                    theme: { width: 640 },
                    sections: [
                        {
                            backgroundColor: "#eeeeee",
                            padding: 10,
                            columns: [
                                {
                                    blocks: [
                                        { type: "heading", text: "Hello {{ contact.first_name }}", level: 2, align: "center", color: "#111111" },
                                        { type: "text", html: "<p>Your tier: {{ company.properties.tier }}</p>", fontSize: 16, color: "#222222", padding: 4 },
                                        { type: "image", src: "https://x.example/a.png", alt: "Logo", href: "https://x.example", width: 120, align: "left" },
                                    ],
                                },
                                {
                                    blocks: [
                                        { type: "button", text: "Shop", href: "https://x.example/?u={{ contact.email }}", color: "#ffffff", borderRadius: 8 },
                                        { type: "divider", color: "#cccccc", thickness: 2, padding: 6 },
                                        { type: "spacer", height: 20 },
                                        { type: "social", links: [{ network: "linkedin", href: "https://linkedin.com/company/acme" }], align: "center" },
                                    ],
                                },
                            ],
                        },
                        { columns: [{ blocks: [{ type: "footer", color: "#999999", align: "left" }] }] },
                    ],
                },
            });
            expect(rendered.status).toBe(200);
            expect(rendered.body.subject).toBe("Hi <b>Ann</b> from Acme <Corp>");
            expect(rendered.body.html).toContain("Hello &lt;b&gt;Ann&lt;/b&gt;");
            expect(rendered.body.html).toContain("Your tier: gold");
            expect(rendered.body.html).toContain("About pro");
            expect(rendered.body.html).toContain("https://x.example/?u=ann@x.example");
            expect(rendered.body.html).toContain("1 Main St, Springfield");
            expect(rendered.body.html).toContain('href="#unsubscribe"');
            expect(rendered.body.text).toContain("Your tier: gold");

            // A made-up reader when no contact is named.
            const sample = await call(ctx, "post", path("/render"), ctx.users.viewer, { subject: "Hi {{ contact.first_name }}", design: design([]) });
            expect(sample.body.subject).toBe("Hi Jane");
            expect((await call(ctx, "post", path("/render"), ctx.users.viewer, { subject: "x", design: design([]), contactUid: "nobody" })).status).toBe(400);
            expect((await call(ctx, "post", path("/render"), ctx.users.viewer, { subject: "{{ x", design: design([]) })).status).toBe(400);
        });

        it("lists the merge tags, custom properties included", async () => {
            await call(ctx, "post", `/properties/${workspaceUid}`, ctx.users.owner, { objectType: "company", key: "tier", label: "Tier", type: "text" });
            const tags = (await call(ctx, "get", path("/merge-tags"), ctx.users.viewer)).body;
            expect(tags[0]).toEqual({ tag: "contact.first_name", label: "First name" });
            expect(tags.at(-1)).toEqual({ tag: "company.properties.tier", label: "Tier (company)" });
        });

        it("sends a test to a mailbox the caller can read, and refuses anything else", async () => {
            await ctx.createMailbox(ctx.users.owner.uid, "news@acme.example");
            const sender = (await call(ctx, "post", `/workspaces/${workspaceUid}/senders`, ctx.users.owner, { fromAddress: "news@acme.example", fromName: "Acme" })).body;
            await ctx.createMailbox(ctx.users.editor.uid, "editor@acme.example");
            await ctx.createMailbox(ctx.users.stranger.uid, "stranger@acme.example");
            const template = (await call(ctx, "post", path(), ctx.users.editor, { name: "T", subject: "Hi {{ contact.first_name }}" })).body;

            const sent = await call(ctx, "post", path(`/${template.uid}/test`), ctx.users.editor, { to: "editor@acme.example", senderUid: sender.uid });
            expect(sent.body).toEqual({ sent: "editor@acme.example" });
            const [mail] = ctx.transport().sent;
            expect(mail.envelopeTo).toEqual(["editor@acme.example"]);
            expect(mail.raw.toString()).toContain("Subject: [Test] Hi Jane");

            expect((await call(ctx, "post", path(`/${template.uid}/test`), ctx.users.editor, { to: "stranger@acme.example", senderUid: sender.uid })).status).toBe(400);
            expect((await call(ctx, "post", path(`/${template.uid}/test`), ctx.users.editor, { to: "nobody@acme.example", senderUid: sender.uid })).status).toBe(400);
            expect((await call(ctx, "post", path(`/${template.uid}/test`), ctx.users.editor, { to: "editor@acme.example", senderUid: "nope" })).status).toBe(400);
            vi.spyOn(ctx.transport(), "send").mockResolvedValueOnce({ accepted: [], rejected: ["editor@acme.example"] });
            expect((await call(ctx, "post", path(`/${template.uid}/test`), ctx.users.editor, { to: "editor@acme.example", senderUid: sender.uid })).status).toBe(400);
            vi.restoreAllMocks();
        });

        it("saves reusable blocks", async () => {
            const blocksPath = `/saved-blocks/${workspaceUid}`;
            const saved = await call(ctx, "post", blocksPath, ctx.users.editor, { name: "Signature", blocks: [textBlock("<p>Cheers, <b>Acme</b></p>")] });
            expect(saved.status).toBe(200);
            expect(saved.body.blocks[0]).toMatchObject({ type: "text", html: "<p>Cheers, <b>Acme</b></p>" });
            expect((await call(ctx, "put", `${blocksPath}/${saved.body.uid}`, ctx.users.editor, { name: "Sign-off" })).body.name).toBe("Sign-off");
            expect((await call(ctx, "put", `${blocksPath}/${saved.body.uid}`, ctx.users.editor, { blocks: [{ type: "spacer", height: 5 }] })).body.blocks).toHaveLength(1);
            expect((await call(ctx, "put", `${blocksPath}/${saved.body.uid}`, ctx.users.editor, { name: null })).status).toBe(400);
            for (const body of [{ name: "x", blocks: [] }, { name: "x", blocks: [{ type: "html", html: "<p>x</p>" }] }, { blocks: [{ type: "spacer", height: 1 }] }]) {
                expect((await call(ctx, "post", blocksPath, ctx.users.editor, body)).status).toBe(400);
            }
            expect((await call(ctx, "post", blocksPath, ctx.users.owner, { name: "x", blocks: [{ type: "html", html: "<p>x</p>" }] })).status).toBe(200);
        });
    });
}
