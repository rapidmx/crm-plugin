///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * The automation editor's graph edits and layout, as pure functions over an `AutomationGraph`: each returns a new graph and leaves
 * the one it was given alone.
 */
import type { AutomationEdge, AutomationGraph, AutomationNode, NodeType } from "../../crmApi.js";

/** The ports out of each step type, as the server has them. */
export const PORTS: Readonly<Record<NodeType, readonly string[]>> = {
    trigger: ["next"],
    delay: ["next"],
    wait: ["matched", "timeout"],
    condition: ["yes", "no"],
    split: ["a", "b"],
    send_email: ["next"],
    set_field: ["next"],
    add_tag: ["next"],
    remove_tag: ["next"],
    subscribe: ["next"],
    unsubscribe: ["next"],
    create_task: ["next"],
    notify: ["next"],
    enroll: ["next"],
    exit: [],
};

/** What each port is called on screen. */
export const PORT_LABELS: Readonly<Record<string, string>> = {
    next: "",
    yes: "Yes",
    no: "No",
    a: "Path A",
    b: "Path B",
    matched: "It happened",
    timeout: "It didn't",
};

/** The steps a member can add, grouped as the add menu shows them. */
export const STEP_TYPES: { group: string; types: { type: NodeType; label: string }[] }[] = [
    {
        group: "Timing",
        types: [
            { type: "delay", label: "Wait a while" },
            { type: "wait", label: "Wait for an email to be opened, clicked or replied to" },
        ],
    },
    {
        group: "Branches",
        types: [
            { type: "condition", label: "If / else" },
            { type: "split", label: "Random split" },
        ],
    },
    {
        group: "Actions",
        types: [
            { type: "send_email", label: "Send an email" },
            { type: "set_field", label: "Set a field" },
            { type: "add_tag", label: "Add a tag" },
            { type: "remove_tag", label: "Remove a tag" },
            { type: "subscribe", label: "Subscribe to a list" },
            { type: "unsubscribe", label: "Unsubscribe from a list" },
            { type: "create_task", label: "Create a task" },
            { type: "notify", label: "Notify a member" },
            { type: "enroll", label: "Put into another automation" },
            { type: "exit", label: "End" },
        ],
    },
];

/** What a step type is called. */
export function stepLabel(type: NodeType): string {
    return type === "trigger" ? "Trigger" : STEP_TYPES.flatMap((group) => group.types).find((entry) => entry.type === type)!.label;
}

/** A new step id, unlike those in `graph`. */
export function newNodeId(graph: AutomationGraph, type: NodeType): string {
    for (let index = 1; ; index++) {
        const id: string = `${type.replace(/_/g, "-")}-${index}`;
        if (!graph.nodes.some((node) => node.id === id)) {
            return id;
        }
    }
}

/** The settings a new step of `type` starts with. */
export function defaultConfig(type: NodeType): Record<string, unknown> {
    switch (type) {
        case "delay":
            return { amount: 1, unit: "days" };
        case "wait":
            return { event: "email.opened", timeoutAmount: 3, timeoutUnit: "days" };
        case "split":
            return { percent: 50 };
        case "set_field":
            return { field: "lifecycleStage", value: "lead" };
        case "trigger":
            return { event: "list.subscribed" };
        default:
            return {};
    }
}

/** The node `port` of `nodeId` leads to, if any. */
export function target(graph: AutomationGraph, nodeId: string, port: string): string | undefined {
    return graph.edges.find((edge) => edge.from === nodeId && edge.port === port)?.to;
}

/**
 * `graph` with a new step of `type` out of `fromId` by `port`. Whatever that port led to follows the new step (by its first port);
 * a step with no way out (an end) takes nothing after it. Returns the graph and the new step's id.
 */
export function insertStep(graph: AutomationGraph, fromId: string, port: string, type: NodeType): { graph: AutomationGraph; id: string } {
    const id: string = newNodeId(graph, type);
    const node: AutomationNode = { id, type, config: defaultConfig(type) };
    const after: string | undefined = target(graph, fromId, port);
    const edges: AutomationEdge[] = graph.edges.filter((edge) => !(edge.from === fromId && edge.port === port));
    edges.push({ from: fromId, to: id, port });
    if (after && PORTS[type].length > 0) {
        edges.push({ from: id, to: after, port: PORTS[type][0] });
    }
    return { graph: prune({ nodes: [...graph.nodes, node], edges }), id };
}

/**
 * `graph` without step `id`: what led to it now leads where its first way out led (a branch's other ways, and anything only they
 * reached, go with it). The trigger can't be removed.
 */
export function removeStep(graph: AutomationGraph, id: string): AutomationGraph {
    const node: AutomationNode | undefined = graph.nodes.find((entry) => entry.id === id);
    if (!node || node.type === "trigger") {
        return graph;
    }
    const after: string | undefined = PORTS[node.type].length > 0 ? target(graph, id, PORTS[node.type][0]) : undefined;
    const edges: AutomationEdge[] = [];
    for (const edge of graph.edges) {
        if (edge.from === id) {
            continue;
        }
        if (edge.to === id) {
            if (after && after !== edge.from) {
                edges.push({ ...edge, to: after });
            }
            continue;
        }
        edges.push(edge);
    }
    return prune({ nodes: graph.nodes.filter((entry) => entry.id !== id), edges });
}

/** `graph` with step `id`'s settings changed by `patch`. */
export function configure(graph: AutomationGraph, id: string, patch: Record<string, unknown>): AutomationGraph {
    return { ...graph, nodes: graph.nodes.map((node) => (node.id === id ? { ...node, config: { ...node.config, ...patch } } : node)) };
}

/** `graph` without the steps the trigger can't reach, and their connections. */
export function prune(graph: AutomationGraph): AutomationGraph {
    const trigger: AutomationNode | undefined = graph.nodes.find((node) => node.type === "trigger");
    if (!trigger) {
        return graph;
    }
    const reached: Set<string> = new Set([trigger.id]);
    const queue: string[] = [trigger.id];
    while (queue.length > 0) {
        const current: string = queue.shift()!;
        for (const edge of graph.edges) {
            if (edge.from === current && !reached.has(edge.to)) {
                reached.add(edge.to);
                queue.push(edge.to);
            }
        }
    }
    return {
        nodes: graph.nodes.filter((node) => reached.has(node.id)),
        edges: graph.edges.filter((edge) => reached.has(edge.from) && reached.has(edge.to)),
    };
}

/** One step as the flow draws it: the step, and what each of its ways out leads to - a step, a jump to one drawn already, or nothing. */
export interface FlowStep {
    node: AutomationNode;
    outs: { port: string; next?: FlowStep; goto?: string }[];
}

/** The flow from the trigger, as a tree: a step reached a second time (a loop, or branches joining) is drawn as a jump to it. */
export function layout(graph: AutomationGraph): FlowStep | undefined {
    const trigger: AutomationNode | undefined = graph.nodes.find((node) => node.type === "trigger");
    if (!trigger) {
        return undefined;
    }
    const drawn: Set<string> = new Set();
    const draw = (node: AutomationNode): FlowStep => {
        drawn.add(node.id);
        return {
            node,
            outs: PORTS[node.type].map((port) => {
                const to: string | undefined = target(graph, node.id, port);
                if (!to) {
                    return { port };
                }
                if (drawn.has(to)) {
                    return { port, goto: to };
                }
                return { port, next: draw(graph.nodes.find((entry) => entry.id === to)!) };
            }),
        };
    };
    return draw(trigger);
}

/** `graph` with `port` of `fromId` leading to the existing step `toId` (a jump back, or joining another branch). */
export function connect(graph: AutomationGraph, fromId: string, port: string, toId: string): AutomationGraph {
    return prune({ nodes: graph.nodes, edges: [...graph.edges.filter((edge) => !(edge.from === fromId && edge.port === port)), { from: fromId, to: toId, port }] });
}

/** The `send_email` steps before `nodeId`: what a wait can wait on. */
export function earlierSends(graph: AutomationGraph, nodeId: string): AutomationNode[] {
    const found: Set<string> = new Set();
    const queue: string[] = [nodeId];
    while (queue.length > 0) {
        const current: string = queue.shift()!;
        for (const edge of graph.edges) {
            if (edge.to === current && !found.has(edge.from)) {
                found.add(edge.from);
                queue.push(edge.from);
            }
        }
    }
    return graph.nodes.filter((node) => found.has(node.id) && node.type === "send_email");
}

/** A ready-made automation to start from. */
export interface Recipe {
    name: string;
    description: string;
    graph: AutomationGraph;
}

/** The automations the "New automation" dialog offers to start from. Their emails and lists are left for the member to choose. */
export const RECIPES: Recipe[] = [
    { name: "Start from scratch", description: "Just a trigger.", graph: { nodes: [{ id: "trigger", type: "trigger", config: { event: "list.subscribed" } }], edges: [] } },
    {
        name: "Welcome, and follow up if there's no reply",
        description: "Sends a welcome to new subscribers; three days on, those who haven't replied get a follow-up.",
        graph: {
            nodes: [
                { id: "trigger", type: "trigger", config: { event: "list.subscribed" } },
                { id: "welcome", type: "send_email", config: {} },
                { id: "wait-1", type: "wait", config: { event: "email.replied", sendNodeId: "welcome", timeoutAmount: 3, timeoutUnit: "days" } },
                { id: "follow-up", type: "send_email", config: {} },
            ],
            edges: [
                { from: "trigger", to: "welcome", port: "next" },
                { from: "welcome", to: "wait-1", port: "next" },
                { from: "wait-1", to: "follow-up", port: "timeout" },
            ],
        },
    },
    {
        name: "Welcome series",
        description: "Three emails over a week to new subscribers.",
        graph: {
            nodes: [
                { id: "trigger", type: "trigger", config: { event: "list.subscribed" } },
                { id: "email-1", type: "send_email", config: {} },
                { id: "delay-1", type: "delay", config: { amount: 2, unit: "days" } },
                { id: "email-2", type: "send_email", config: {} },
                { id: "delay-2", type: "delay", config: { amount: 5, unit: "days" } },
                { id: "email-3", type: "send_email", config: {} },
            ],
            edges: [
                { from: "trigger", to: "email-1", port: "next" },
                { from: "email-1", to: "delay-1", port: "next" },
                { from: "delay-1", to: "email-2", port: "next" },
                { from: "email-2", to: "delay-2", port: "next" },
                { from: "delay-2", to: "email-3", port: "next" },
            ],
        },
    },
    {
        name: "Follow up on a form",
        description: "When someone fills in a form, a member gets a task to call them and an email goes out.",
        graph: {
            nodes: [
                { id: "trigger", type: "trigger", config: { event: "form.submitted" } },
                { id: "task", type: "create_task", config: { title: "Call the new lead", dueInDays: 1 } },
                { id: "email", type: "send_email", config: {} },
            ],
            edges: [
                { from: "trigger", to: "task", port: "next" },
                { from: "task", to: "email", port: "next" },
            ],
        },
    },
    {
        name: "Win back",
        description: "When a contact leaves a segment of engaged contacts, send them an email and tag them if they don't open it.",
        graph: {
            nodes: [
                { id: "trigger", type: "trigger", config: { event: "segment.left" } },
                { id: "email", type: "send_email", config: {} },
                { id: "wait-1", type: "wait", config: { event: "email.opened", sendNodeId: "email", timeoutAmount: 7, timeoutUnit: "days" } },
                { id: "tag", type: "add_tag", config: { tag: "lapsed" } },
            ],
            edges: [
                { from: "trigger", to: "email", port: "next" },
                { from: "email", to: "wait-1", port: "next" },
                { from: "wait-1", to: "tag", port: "timeout" },
            ],
        },
    },
];
