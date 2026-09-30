///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import * as crypto from "crypto";
import { EventEmitter } from "events";
import { checkWebhookUrl, defaultLookup, isPublicAddress, newWebhookSecret, postWebhook, signWebhook } from "../../src/webhooks/Webhooks.js";
import { wants } from "../../src/webhooks/Deliveries.js";

/** A stand-in for `https.request`: records the options and body, then answers with `answer`. */
function fakeRequest(answer: (request: any, callback: (response: any) => void) => void) {
    const calls: { options: any; body?: string; resolved?: [string, number] }[] = [];
    const request: any = (options: any, callback: (response: any) => void) => {
        const call: { options: any; body?: string; resolved?: [string, number] } = { options };
        calls.push(call);
        options.lookup("ignored", {}, (_err: unknown, address: string, family: number) => (call.resolved = [address, family]));
        const emitter: any = new EventEmitter();
        emitter.destroy = (err: Error) => emitter.emit("error", err);
        emitter.end = (body: string) => {
            call.body = body;
            answer(emitter, callback);
        };
        return emitter;
    };
    return { calls, request };
}

describe("Webhooks", () => {
    it("makes distinct secrets, and signs the timestamp with the body", () => {
        expect(newWebhookSecret()).toMatch(/^whsec_[A-Za-z0-9_-]{32}$/);
        expect(newWebhookSecret()).not.toBe(newWebhookSecret());
        const expected: string = crypto.createHmac("sha256", "s").update("100.{}").digest("hex");
        expect(signWebhook("s", "{}", 100)).toBe(`t=100,v1=${expected}`);
        expect(signWebhook("s", "{}")).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    });

    it.each([
        ["8.8.8.8", true],
        ["1.1.1.1", true],
        ["10.1.2.3", false],
        ["127.0.0.1", false],
        ["169.254.169.254", false],
        ["172.20.0.1", false],
        ["172.32.0.1", true],
        ["192.168.1.1", false],
        ["100.64.0.1", false],
        ["0.0.0.0", false],
        ["224.0.0.1", false],
        ["255.255.255.255", false],
        ["2606:4700:4700::1111", true],
        ["::1", false],
        ["::", false],
        ["fd00::1", false],
        ["fe80::1", false],
        ["ff02::1", false],
        ["2001:db8::1", false],
        ["::ffff:10.0.0.1", false],
        ["::ffff:8.8.8.8", true],
        ["not-an-ip", false],
    ])("knows whether %s is public", (address, expected) => {
        expect(isPublicAddress(address)).toBe(expected);
    });

    it("takes only https addresses on public hosts", () => {
        expect(checkWebhookUrl("https://hooks.example.com/x").hostname).toBe("hooks.example.com");
        expect(checkWebhookUrl("https://[2606:4700:4700::1111]/x").hostname).toBe("[2606:4700:4700::1111]");
        expect(() => checkWebhookUrl("nope")).toThrow("valid URL");
        expect(() => checkWebhookUrl("http://hooks.example.com")).toThrow("https://");
        expect(() => checkWebhookUrl("https://u:p@hooks.example.com")).toThrow("user name");
        expect(() => checkWebhookUrl("https://10.0.0.1/")).toThrow("public internet");
        expect(() => checkWebhookUrl("https://[::1]/")).toThrow("public internet");
        for (const host of ["localhost", "a.localhost", "printer.local", "db.internal"]) {
            expect(() => checkWebhookUrl(`https://${host}/`)).toThrow("public internet");
        }
    });

    it("resolves a host to all its addresses", async () => {
        const addresses = await defaultLookup("localhost");
        expect(addresses.length).toBeGreaterThan(0);
    });

    it("posts a signed body to the address it checked, keeping the host name", async () => {
        const { calls, request } = fakeRequest((emitter, callback) => callback({ statusCode: 204, resume: () => undefined }));
        const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
        await expect(postWebhook("https://hooks.example.com:8443/in?x=1", '{"a":1}', "s", { lookup, request })).resolves.toEqual({ status: 204 });
        expect(lookup).toHaveBeenCalledWith("hooks.example.com");
        expect(calls[0].options).toMatchObject({ hostname: "hooks.example.com", port: "8443", path: "/in?x=1", method: "POST" });
        expect(calls[0].options.headers["x-rapidmx-signature"]).toMatch(/^t=\d+,v1=/);
        expect(calls[0].body).toBe('{"a":1}');
        expect(calls[0].resolved).toEqual(["93.184.216.34", 4]);
    });

    it("connects to a literal address without resolving, and answers 0 without a status", async () => {
        const { calls, request } = fakeRequest((emitter, callback) => callback({ resume: () => undefined }));
        const lookup = vi.fn();
        await expect(postWebhook("https://8.8.8.8/", "{}", "s", { lookup, request })).resolves.toEqual({ status: 0 });
        expect(lookup).not.toHaveBeenCalled();
        expect(calls[0].options.port).toBe(443);
        expect(calls[0].resolved).toEqual(["8.8.8.8", 4]);
    });

    it("refuses a host resolving to nothing or to any private address", async () => {
        const { request } = fakeRequest(() => undefined);
        await expect(postWebhook("https://hooks.example.com/", "{}", "s", { lookup: async () => [], request })).rejects.toThrow("private network");
        await expect(
            postWebhook("https://hooks.example.com/", "{}", "s", {
                lookup: async () => [
                    { address: "8.8.8.8", family: 4 },
                    { address: "10.0.0.1", family: 4 },
                ],
                request,
            }),
        ).rejects.toThrow("private network");
    });

    it("fails on a network error or a timeout", async () => {
        const failing = fakeRequest((emitter) => emitter.emit("error", new Error("ECONNREFUSED")));
        await expect(postWebhook("https://8.8.8.8/", "{}", "s", { request: failing.request })).rejects.toThrow("ECONNREFUSED");
        const slow = fakeRequest((emitter) => emitter.emit("timeout"));
        await expect(postWebhook("https://8.8.8.8/", "{}", "s", { request: slow.request, timeoutMs: 2000 })).rejects.toThrow("within 2 seconds");
    });

    it("sends an endpoint the events it takes", () => {
        expect(wants({ enabled: true, events: ["*"] }, "deal.won")).toBe(true);
        expect(wants({ enabled: true, events: ["deal.won"] }, "deal.won")).toBe(true);
        expect(wants({ enabled: true, events: ["deal.lost"] }, "deal.won")).toBe(false);
        expect(wants({ enabled: false, events: ["*"] }, "deal.won")).toBe(false);
    });
});
