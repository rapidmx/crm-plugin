///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { AutomationEngine, happened, triggerMatches, triggerOf } from "../../src/automation/Engine.js";
import { recordCrmEvent } from "../../src/automation/Events.js";
import { nextNode } from "../../src/automation/Graph.js";

describe("automation engine helpers", () => {
    it("matches triggers by event, list, form, segment and changed fields", () => {
        const trigger = (config: Record<string, unknown>) => ({ id: "t", type: "trigger" as any, config });
        expect(triggerMatches(trigger({ event: "list.subscribed" }), { type: "list.subscribed", data: {} })).toBe(true);
        expect(triggerMatches(trigger({ event: "list.subscribed" }), { type: "form.submitted", data: {} })).toBe(false);
        expect(triggerMatches(trigger({ event: "manual" }), { type: "manual", data: {} })).toBe(false);
        expect(triggerMatches(trigger({ event: "list.subscribed", listUid: "l1" }), { type: "list.subscribed", data: { listUid: "l2" } })).toBe(false);
        expect(triggerMatches(trigger({ event: "contact.updated", fields: ["score"] }), { type: "contact.updated", data: { fields: ["score"] } })).toBe(true);
        expect(triggerMatches(trigger({ event: "contact.updated", fields: ["score"] }), { type: "contact.updated", data: {} })).toBe(false);
        expect(triggerOf({ nodes: [], edges: [] })).toBeUndefined();
        expect(nextNode({ nodes: [], edges: [{ from: "a", to: "b", port: "next" }] }, "a")).toBe("b");
    });

    it("tells whether what a wait waits for happened", () => {
        const send: any = { firstOpenedAt: new Date(), machineOpen: true };
        expect(happened(send, "email.opened")).toBe(false);
        expect(happened({ ...send, machineOpen: false }, "email.opened")).toBe(true);
        expect(happened(send, "email.clicked")).toBe(false);
        expect(happened({ repliedAt: new Date() } as any, "email.replied")).toBe(true);
    });

    it("doesn't enroll in an automation that isn't active, and queues an email step once", async () => {
        const engine = new AutomationEngine({ repos: {} as any, classes: {} as any });
        expect(await engine.enroll({ status: "paused" } as any, {} as any, "c", "manual")).toBeUndefined();
        const create = vi.fn();
        const repos: any = { get: async () => ({ find: async () => [{ uid: "existing" }], create }) };
        const queueing = new AutomationEngine({ repos, classes: {} as any });
        await (queueing as any).queueEmail({ id: "n", config: {} }, { uid: "e" }, { workspaceUid: "w", uid: "a" }, { uid: "c", email: "a@x" });
        expect(create).not.toHaveBeenCalled();
    });

    it("logs an event that can't be recorded", async () => {
        const logger = { warn: vi.fn() };
        const repos: any = { get: async () => ({ create: async () => Promise.reject(new Error("disk full")) }) };
        await recordCrmEvent(repos, { crmEvent: class {} } as any, { workspaceUid: "w", type: "manual" as any, contactUid: "c" }, logger);
        expect(logger.warn).toHaveBeenCalledWith("Could not record a manual event: disk full");
        await recordCrmEvent(repos, { crmEvent: class {} } as any, { workspaceUid: "w", type: "manual" as any, contactUid: "c" });
    });
});
