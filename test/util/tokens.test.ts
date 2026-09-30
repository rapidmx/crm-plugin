///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import * as crypto from "crypto";
import { simpleParser } from "mailparser";
import { MAX_TOKEN_LENGTH, signToken, verifyToken } from "../../src/util/Tokens.js";
import { composeMessage, escapeHtml, sendSystemMessage, simpleHtml } from "../../src/util/Mailer.js";

describe("Tokens", () => {
    const secret = "k";

    it("round-trips a payload for its purpose only, and until it expires", () => {
        const token: string = signToken({ p: "unsub", w: "w", c: "c", l: ["l1"], x: 2000000000 }, secret);
        expect(verifyToken(token, secret, "unsub")).toEqual({ p: "unsub", w: "w", c: "c", l: ["l1"], x: 2000000000 });
        expect(verifyToken(token, secret, "prefs")).toBeUndefined();
        expect(verifyToken(token, secret, "unsub", new Date(2000000001 * 1000))).toBeUndefined();
        expect(verifyToken(token, "other", "unsub")).toBeUndefined();
    });

    it.each([
        ["not a string", 5],
        ["too long", "x".repeat(MAX_TOKEN_LENGTH + 1)],
        ["no dot", "abc"],
        ["two dots", "a.b.c"],
        ["empty body", ".abc"],
    ])("refuses %s", (_name, token) => {
        expect(verifyToken(token, secret, "prefs")).toBeUndefined();
    });

    it("refuses a correctly signed body that isn't a valid payload", () => {
        const sign = (body: string) => signToken({ p: "prefs", w: "w", c: "c" }, secret).replace(/^[^.]+/, body);
        const forged = (payload: unknown) => {
            const body: string = Buffer.from(JSON.stringify(payload)).toString("base64url");
            return `${body}.${crypto.createHmac("sha256", secret).update(body).digest("base64url")}`;
        };
        expect(verifyToken(sign("x"), secret, "prefs")).toBeUndefined();
        const notJson: string = Buffer.from("{").toString("base64url");
        expect(verifyToken(forged("x").replace(/^[^.]+/, notJson), secret, "prefs")).toBeUndefined();
        expect(verifyToken(`${notJson}.${crypto.createHmac("sha256", secret).update(notJson).digest("base64url")}`, secret, "prefs")).toBeUndefined();
        for (const payload of [
            null,
            { p: "prefs", w: 1, c: "c" },
            { p: "prefs", w: "w", c: 1 },
            { p: "prefs", w: "w", c: "c", l: "l" },
            { p: "prefs", w: "w", c: "c", l: [1] },
            { p: "prefs", w: "w", c: "c", x: "soon" },
        ]) {
            expect(verifyToken(forged(payload), secret, "prefs")).toBeUndefined();
        }
    });
});

describe("Mailer", () => {
    const sender = { fromAddress: "news@acme.example", fromName: "Acme", replyToAddress: "help@acme.example" };

    it("escapes HTML and builds a small complete email", () => {
        expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
        const html: string = simpleHtml("Hi <you>", ["One & two"], { label: "Go", href: "https://x.example/?a=1&b=2" });
        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("Hi &lt;you&gt;");
        expect(html).toContain('href="https://x.example/?a=1&amp;b=2"');
        expect(simpleHtml("Hi", [])).not.toContain("<a ");
    });

    it("composes multipart/alternative mail with the sender, reply-to and extra headers", async () => {
        const raw: Buffer = await composeMessage({ sender, to: "ann@x.example", subject: "Hello", text: "Hi", html: "<p>Hi</p>", headers: { "X-Test": "1" } });
        const parsed = await simpleParser(raw);
        expect(parsed.from?.value[0]).toMatchObject({ address: "news@acme.example", name: "Acme" });
        expect(parsed.replyTo?.value[0].address).toBe("help@acme.example");
        expect(parsed.headers.get("x-test")).toBe("1");
        expect(parsed.text?.trim()).toBe("Hi");
        expect(parsed.html).toContain("<p>Hi</p>");
        const noReply = await simpleParser(await composeMessage({ sender: { ...sender, replyToAddress: undefined }, to: "a@x.example", subject: "s", text: "t", html: "h" }));
        expect(noReply.replyTo).toBeUndefined();
    });

    it("sends through the transport, and throws when nobody was accepted", async () => {
        const transport: any = { name: "t", send: vi.fn().mockResolvedValueOnce({ accepted: ["a@x.example"], rejected: [] }).mockResolvedValue({ accepted: [], rejected: ["a@x.example"] }) };
        await sendSystemMessage(transport, { sender, to: "a@x.example", subject: "s", text: "t", html: "h" });
        expect(transport.send.mock.calls[0][0]).toMatchObject({ envelopeFrom: "news@acme.example", envelopeTo: ["a@x.example"] });
        await expect(sendSystemMessage(transport, { sender, to: "a@x.example", subject: "s", text: "t", html: "h" })).rejects.toThrow("refused");
    });
});
