///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { AbMetric } from "../../src/models/types.js";
import { metricRate } from "../../src/jobs/CampaignJob.js";
import { assignVariant, audiencePage, countAudience, suppressedAmong } from "../../src/sending/Audience.js";
import { emptyCounts, linkClicks } from "../../src/sending/Stats.js";
import {
    MACHINE_WINDOW_MS,
    SEND_TOKEN,
    TRACKING_PIXEL,
    addOpenPixel,
    clickPath,
    isMachine,
    newSendToken,
    tokenFromVerp,
    trackLinks,
    verifyClick,
    verpAddress,
} from "../../src/sending/Tracking.js";

describe("Tracking", () => {
    it("makes tokens and signed click paths that only verify unchanged", () => {
        const token: string = newSendToken();
        expect(token).toMatch(SEND_TOKEN);
        const path: string = clickPath("secret", token, 2, "https://x.example/?a=1&b=2");
        const url = new URL(`https://h${path}`);
        expect(url.pathname).toBe(`/t/c/${token}/2`);
        expect(url.searchParams.get("u")).toBe("https://x.example/?a=1&b=2");
        const signature: string = url.searchParams.get("s")!;
        expect(verifyClick("secret", token, 2, "https://x.example/?a=1&b=2", signature)).toBe(true);
        expect(verifyClick("secret", token, 3, "https://x.example/?a=1&b=2", signature)).toBe(false);
        expect(verifyClick("other", token, 2, "https://x.example/?a=1&b=2", signature)).toBe(false);
        expect(verifyClick("secret", token, 2, "https://x.example/?a=1&b=2", "short")).toBe(false);
        expect(verifyClick("secret", token, 2, "https://x.example/?a=1&b=2", undefined)).toBe(false);
        expect(TRACKING_PIXEL.subarray(0, 3).toString()).toBe("GIF");
    });

    it("tells machines from people", () => {
        const now = new Date("2026-09-30T12:00:00Z");
        expect(isMachine(undefined, undefined, now)).toBe(true);
        expect(isMachine("Mimecast Link Scanner", undefined, now)).toBe(true);
        expect(isMachine("Mozilla/5.0", new Date(now.getTime() - MACHINE_WINDOW_MS + 1), now)).toBe(true);
        expect(isMachine("Mozilla/5.0", new Date(now.getTime() - 60_000), now)).toBe(false);
        expect(isMachine("Mozilla/5.0", undefined)).toBe(false);
    });

    it("rewrites web links but keeps the unsubscribe links, mail links and anything odd", () => {
        const html = `<a href="https://a.example/?x=1&amp;y=2">A</a> <a class="b" href='http://b.example'>B</a> <a href="mailto:m@x">M</a> <a href="https://keep.example">K</a> <a name="n">N</a>`;
        const { html: out, urls } = trackLinks(html, (url, index) => `https://t/${index}?u=${url}`, new Set(["https://keep.example"]));
        expect(urls).toEqual(["https://a.example/?x=1&y=2", "http://b.example"]);
        expect(out).toBe(
            `<a href="https://t/0?u=https://a.example/?x=1&amp;y=2">A</a> <a class="b" href='https://t/1?u=http://b.example'>B</a> <a href="mailto:m@x">M</a> <a href="https://keep.example">K</a> <a name="n">N</a>`,
        );
        expect(trackLinks(`<a href="https://q.example/&quot;&#39;&lt;&gt;">Q</a>`, (url) => url, new Set()).urls).toEqual([`https://q.example/"'<>`]);
    });

    it("adds the open image before the body's end, or at the end", () => {
        expect(addOpenPixel("<html><body><p>x</p></BODY></html>", "https://t/o/1?a&b")).toBe(
            '<html><body><p>x</p><img src="https://t/o/1?a&amp;b" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;overflow:hidden" /></BODY></html>',
        );
        expect(addOpenPixel("<p>x</p>", "https://t")).toMatch(/^<p>x<\/p><img src="https:\/\/t"/);
    });

    it("makes and reads per-message bounce addresses", () => {
        const token: string = "abcdefghijklmnopqrstuv";
        expect(verpAddress("news@acme.example", token)).toBe(`news+b-${token}@acme.example`);
        expect(verpAddress(`${"x".repeat(40)}@acme.example`, token)).toBe(`${"x".repeat(40)}@acme.example`);
        expect(tokenFromVerp(`news+b-${token}@acme.example`)).toBe(token);
        expect(tokenFromVerp("news@acme.example")).toBeUndefined();
    });
});

describe("Audience", () => {
    const repos = (rows: Record<string, any[]>) => ({ get: async (name: string) => ({ find: async () => rows[name] ?? [] }) }) as any;

    it("has nobody without lists or addresses, and stops counting at the cap", async () => {
        expect(await audiencePage(repos({}), { workspaceUid: "w", listUids: [], excludeListUids: [] }, undefined, 10)).toEqual({ contacts: [] });
        expect(await suppressedAmong(repos({}), "w", [])).toEqual(new Set());
        const many = repos({
            subscription: [{ uid: "s1", contactUid: "c1" }, { uid: "s2", contactUid: "c2" }],
            contact: [{ uid: "c1", email: "a@x", emailStatus: "active" }, { uid: "c2", email: "b@x", emailStatus: "active" }],
        });
        expect(await countAudience(many, { workspaceUid: "w", listUids: ["l"], excludeListUids: [] }, 2)).toEqual({ count: 2, capped: true });
    });

    it("assigns variants stably, holding back the rest", () => {
        const test = { variants: [{ id: "A" }, { id: "B" }], testPercent: 50, metric: AbMetric.OPEN, testHours: 1 };
        expect(assignVariant("c", "x", undefined)).toBe("A");
        const assigned: string[] = Array.from({ length: 200 }, (_v, i) => assignVariant("campaign", `contact${i}`, test));
        expect(assigned.filter((id) => id === "").length).toBeGreaterThan(60);
        expect(new Set(assigned)).toEqual(new Set(["", "A", "B"]));
        expect(assignVariant("campaign", "contact7", test)).toBe(assigned[7]);
    });
});

describe("Stats", () => {
    it("rates variants by their metric", () => {
        expect(metricRate(emptyCounts(), AbMetric.OPEN)).toBe(0);
        const counts = { ...emptyCounts(), sent: 4, opened: 2, clicked: 1, replied: 3 };
        expect(metricRate(counts, AbMetric.OPEN)).toBe(0.5);
        expect(metricRate(counts, AbMetric.CLICK)).toBe(0.25);
        expect(metricRate(counts, AbMetric.REPLY)).toBe(0.75);
    });

    it("counts clicks per link over pages of events", async () => {
        const page = (count: number, url?: string) => Array.from({ length: count }, (_v, i) => ({ sendUid: `s${i % 3}`, data: url ? { url } : {} }));
        const pages = [page(1000, "https://a"), page(2)];
        const repo: any = { find: vi.fn(async () => pages.shift() ?? []) };
        expect(await linkClicks(repo, "c")).toEqual([
            { url: "https://a", clicks: 1000, uniqueClicks: 3 },
            { url: "", clicks: 2, uniqueClicks: 2 },
        ]);
        const capped: any = { find: vi.fn(async () => page(1000, "https://b")) };
        expect((await linkClicks(capped, "c", 1000))[0].clicks).toBe(1000);
        expect(capped.find).toHaveBeenCalledTimes(1);
    });
});
