///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import type { AutomationGraph } from "../../../../apps/shared/crmApi.js";
import {
    RECIPES,
    configure,
    connect,
    defaultConfig,
    earlierSends,
    insertStep,
    layout,
    newNodeId,
    prune,
    removeStep,
    stepLabel,
    target,
} from "../../../../apps/shared/components/automations/flowModel.js";

const base = (): AutomationGraph => ({
    nodes: [
        { id: "t", type: "trigger", config: {} },
        { id: "s", type: "send_email", config: {} },
    ],
    edges: [{ from: "t", to: "s", port: "next" }],
});

describe("flowModel", () => {
    it("names steps and gives them ids and settings", () => {
        expect(stepLabel("trigger")).toBe("Trigger");
        expect(stepLabel("split")).toBe("Random split");
        expect(newNodeId(base(), "send_email")).toBe("send-email-1");
        expect(newNodeId({ ...base(), nodes: [{ id: "delay-1", type: "delay", config: {} }] }, "delay")).toBe("delay-2");
        for (const type of ["delay", "wait", "split", "set_field", "trigger", "exit"] as const) {
            expect(defaultConfig(type)).toBeTypeOf("object");
        }
    });

    it("inserts steps between others, with branches taking what followed on their first way", () => {
        const withDelay = insertStep(base(), "t", "next", "delay");
        expect(withDelay.id).toBe("delay-1");
        expect(target(withDelay.graph, "t", "next")).toBe("delay-1");
        expect(target(withDelay.graph, "delay-1", "next")).toBe("s");
        const withBranch = insertStep(withDelay.graph, "delay-1", "next", "condition");
        expect(target(withBranch.graph, withBranch.id, "yes")).toBe("s");
        expect(target(withBranch.graph, withBranch.id, "no")).toBeUndefined();
        // An end takes nothing after it: what followed is gone.
        const ended = insertStep(base(), "t", "next", "exit");
        expect(ended.graph.nodes.map((node) => node.id)).toEqual(["t", "exit-1"]);
        expect(insertStep(base(), "s", "next", "add_tag").graph.edges).toHaveLength(2);
    });

    it("removes steps, reconnecting around them and dropping what only a branch reached", () => {
        const one = insertStep(base(), "t", "next", "delay").graph;
        const removed = removeStep(one, "delay-1");
        expect(target(removed, "t", "next")).toBe("s");
        const branched = insertStep(base(), "s", "next", "condition");
        const withNo = insertStep(branched.graph, branched.id, "no", "add_tag").graph;
        const withoutBranch = removeStep(withNo, branched.id);
        expect(withoutBranch.nodes.map((node) => node.id)).toEqual(["t", "s"]);
        expect(removeStep(base(), "t")).toEqual(base());
        expect(removeStep(base(), "nope")).toEqual(base());
        // A step looping to itself: the loop doesn't survive it.
        const looped = connect(insertStep(base(), "s", "next", "delay").graph, "delay-1", "next", "s");
        expect(removeStep(looped, "delay-1").edges).toEqual([{ from: "t", to: "s", port: "next" }]);
    });

    it("configures steps, connects them, prunes and lays the flow out", () => {
        expect(configure(base(), "s", { templateUid: "x" }).nodes[1].config).toEqual({ templateUid: "x" });
        const looped = connect(insertStep(base(), "s", "next", "delay").graph, "delay-1", "next", "s");
        const tree = layout(looped)!;
        expect(tree.node.id).toBe("t");
        expect(tree.outs[0].next!.node.id).toBe("s");
        expect(tree.outs[0].next!.outs[0].next!.outs[0]).toEqual({ port: "next", goto: "s" });
        const open = layout(insertStep(base(), "s", "next", "split").graph)!;
        expect(open.outs[0].next!.outs[0].next!.outs).toEqual([{ port: "a" }, { port: "b" }]);
        expect(layout({ nodes: [], edges: [] })).toBeUndefined();
        expect(prune({ nodes: [{ id: "x", type: "exit", config: {} }], edges: [] })).toEqual({ nodes: [{ id: "x", type: "exit", config: {} }], edges: [] });
        expect(prune({ ...base(), nodes: [...base().nodes, { id: "orphan", type: "exit", config: {} }] }).nodes).toHaveLength(2);
    });

    it("finds the email steps a wait can wait on, and offers recipes", () => {
        const graph = insertStep(base(), "s", "next", "wait").graph;
        expect(earlierSends(graph, "wait-1").map((node) => node.id)).toEqual(["s"]);
        expect(earlierSends(graph, "s")).toEqual([]);
        expect(RECIPES.map((recipe) => recipe.graph.nodes[0].type)).toEqual(RECIPES.map(() => "trigger"));
    });
});
