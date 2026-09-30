///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { badRequest, isObject } from "../util/Validation.js";
import { CrmEventType } from "./Events.js";

/** What an automation step does. */
export enum NodeType {
    TRIGGER = "trigger",
    DELAY = "delay",
    WAIT = "wait",
    CONDITION = "condition",
    SPLIT = "split",
    SEND_EMAIL = "send_email",
    SET_FIELD = "set_field",
    ADD_TAG = "add_tag",
    REMOVE_TAG = "remove_tag",
    SUBSCRIBE = "subscribe",
    UNSUBSCRIBE = "unsubscribe",
    CREATE_TASK = "create_task",
    NOTIFY = "notify",
    ENROLL = "enroll",
    EXIT = "exit",
}

/** One step of an automation. `config` depends on `type` - see `NODE_SPECS`. */
export interface AutomationNode {
    id: string;
    type: NodeType;
    config: Record<string, unknown>;
}

/** A way from one step to the next: out of `from` by `port` (`next`, or a branch: `yes`/`no`, `a`/`b`, `matched`/`timeout`). */
export interface AutomationEdge {
    from: string;
    to: string;
    port: string;
}

export interface AutomationGraph {
    nodes: AutomationNode[];
    edges: AutomationEdge[];
}

/** The events a trigger can start from. */
export const TRIGGER_EVENTS: readonly CrmEventType[] = Object.values(CrmEventType);

/** The events a wait can wait for: something done with a message an earlier step sent. */
export const WAIT_EVENTS: readonly CrmEventType[] = [CrmEventType.EMAIL_OPENED, CrmEventType.EMAIL_CLICKED, CrmEventType.EMAIL_REPLIED];

/** The contact fields a `set_field` step may set. */
export const SETTABLE_FIELDS: readonly string[] = ["lifecycleStage", "leadStatus", "ownerUserUid"];

/** Units of time a delay or a wait's timeout counts in, in milliseconds. */
export const TIME_UNITS: Readonly<Record<string, number>> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };

/** The ports out of each node type. */
export const PORTS: Readonly<Record<NodeType, readonly string[]>> = {
    [NodeType.TRIGGER]: ["next"],
    [NodeType.DELAY]: ["next"],
    [NodeType.WAIT]: ["matched", "timeout"],
    [NodeType.CONDITION]: ["yes", "no"],
    [NodeType.SPLIT]: ["a", "b"],
    [NodeType.SEND_EMAIL]: ["next"],
    [NodeType.SET_FIELD]: ["next"],
    [NodeType.ADD_TAG]: ["next"],
    [NodeType.REMOVE_TAG]: ["next"],
    [NodeType.SUBSCRIBE]: ["next"],
    [NodeType.UNSUBSCRIBE]: ["next"],
    [NodeType.CREATE_TASK]: ["next"],
    [NodeType.NOTIFY]: ["next"],
    [NodeType.ENROLL]: ["next"],
    [NodeType.EXIT]: [],
};

/** How big a graph may get. */
export const MAX_NODES = 200;
const MAX_CONFIG_BYTES = 64 * 1024;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * `raw` as an automation graph, checked for shape only - node ids, types, edges between existing nodes on the ports their type has,
 * one edge per port - so a half-built draft can be saved. `validateForPublish()` checks the rest.
 */
export function validateGraph(raw: unknown): AutomationGraph {
    if (!isObject(raw) || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) {
        throw badRequest("'graph' must be { nodes, edges }.");
    }
    if (raw.nodes.length > MAX_NODES || raw.edges.length > MAX_NODES * 2) {
        throw badRequest(`An automation may have at most ${MAX_NODES} steps.`);
    }
    const nodes: AutomationNode[] = [];
    const ids: Set<string> = new Set();
    for (const entry of raw.nodes as unknown[]) {
        if (!isObject(entry) || typeof entry.id !== "string" || !ID.test(entry.id) || ids.has(entry.id)) {
            throw badRequest("Each step needs a unique id of letters, digits, '-' or '_'.");
        }
        if (!Object.values(NodeType).includes(entry.type as NodeType)) {
            throw badRequest(`Step ${entry.id} has an unknown type.`);
        }
        const config: unknown = entry.config ?? {};
        if (!isObject(config) || JSON.stringify(config).length > MAX_CONFIG_BYTES) {
            throw badRequest(`Step ${entry.id}'s settings must be an object.`);
        }
        ids.add(entry.id);
        nodes.push({ id: entry.id, type: entry.type as NodeType, config });
    }
    const edges: AutomationEdge[] = [];
    const used: Set<string> = new Set();
    for (const entry of raw.edges as unknown[]) {
        if (!isObject(entry) || typeof entry.from !== "string" || typeof entry.to !== "string" || !ids.has(entry.from) || !ids.has(entry.to)) {
            throw badRequest("Each connection must join two steps of the automation.");
        }
        const from: AutomationNode = nodes.find((node) => node.id === entry.from)!;
        const port: string = typeof entry.port === "string" ? entry.port : "next";
        if (!PORTS[from.type].includes(port) || used.has(`${entry.from}|${port}`)) {
            throw badRequest(`Step ${entry.from} can't have that connection.`);
        }
        used.add(`${entry.from}|${port}`);
        edges.push({ from: entry.from, to: entry.to, port });
    }
    return { nodes, edges };
}

/** The node `port` of `nodeId` leads to, if any. */
export function nextNode(graph: AutomationGraph, nodeId: string, port: string = "next"): string | undefined {
    return graph.edges.find((edge) => edge.from === nodeId && edge.port === port)?.to;
}

/** The references a published graph makes, for the caller to check exist in the workspace. */
export interface GraphReferences {
    templates: Set<string>;
    senders: Set<string>;
    lists: Set<string>;
    forms: Set<string>;
    segments: Set<string>;
    automations: Set<string>;
    members: Set<string>;
    /** Contact filters (triggers, conditions), to validate against the workspace's fields. */
    filters: unknown[];
}

function text(config: Record<string, unknown>, field: string, where: string, max: number = 256): string {
    const value: unknown = config[field];
    if (typeof value !== "string" || value.trim() === "" || value.length > max) {
        throw badRequest(`${where}: '${field}' is required.`);
    }
    return value;
}

function positive(config: Record<string, unknown>, field: string, where: string, max: number): number {
    const value: unknown = config[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
        throw badRequest(`${where}: '${field}' must be a whole number from 1 to ${max}.`);
    }
    return value;
}

function unit(config: Record<string, unknown>, field: string, where: string): void {
    if (typeof config[field] !== "string" || !(String(config[field]) in TIME_UNITS)) {
        throw badRequest(`${where}: '${field}' must be minutes, hours or days.`);
    }
}

/**
 * Checks that `graph` can be published: one trigger that nothing leads back to, every step reachable from it, every step's settings
 * complete, every wait waiting on a message an earlier step sends, and no loop that doesn't pass a delay or a wait (a contact would
 * spin through it). Returns what the settings refer to, for the caller to check.
 */
export function validateForPublish(graph: AutomationGraph): GraphReferences {
    const triggers: AutomationNode[] = graph.nodes.filter((node) => node.type === NodeType.TRIGGER);
    if (triggers.length !== 1) {
        throw badRequest("An automation needs exactly one trigger.");
    }
    const trigger: AutomationNode = triggers[0];
    if (graph.edges.some((edge) => edge.to === trigger.id)) {
        throw badRequest("Nothing can lead back to the trigger.");
    }
    const reachable: Set<string> = new Set([trigger.id]);
    const queue: string[] = [trigger.id];
    while (queue.length > 0) {
        const current: string = queue.shift()!;
        for (const edge of graph.edges.filter((entry) => entry.from === current && !reachable.has(entry.to))) {
            reachable.add(edge.to);
            queue.push(edge.to);
        }
    }
    const orphan: AutomationNode | undefined = graph.nodes.find((node) => !reachable.has(node.id));
    if (orphan) {
        throw badRequest(`Step ${orphan.id} can't be reached from the trigger.`);
    }
    if (!nextNode(graph, trigger.id)) {
        throw badRequest("The trigger must lead somewhere.");
    }
    checkLoops(graph);

    const references: GraphReferences = { templates: new Set(), senders: new Set(), lists: new Set(), forms: new Set(), segments: new Set(), automations: new Set(), members: new Set(), filters: [] };
    for (const node of graph.nodes) {
        const where: string = `Step ${node.id}`;
        const config: Record<string, unknown> = node.config;
        switch (node.type) {
            case NodeType.TRIGGER: {
                if (!TRIGGER_EVENTS.includes(config.event as CrmEventType)) {
                    throw badRequest(`${where}: choose what starts the automation.`);
                }
                for (const [field, set] of [
                    ["listUid", references.lists],
                    ["formUid", references.forms],
                    ["segmentUid", references.segments],
                ] as const) {
                    if (config[field] !== undefined && config[field] !== null && config[field] !== "") {
                        set.add(text(config, field, where, 64));
                    }
                }
                if (config.filter !== undefined && config.filter !== null) {
                    references.filters.push(config.filter);
                }
                break;
            }
            case NodeType.DELAY:
                positive(config, "amount", where, 365);
                unit(config, "unit", where);
                break;
            case NodeType.WAIT: {
                if (!WAIT_EVENTS.includes(config.event as CrmEventType)) {
                    throw badRequest(`${where}: choose what to wait for.`);
                }
                const sendNodeId: string = text(config, "sendNodeId", where, 64);
                const send: AutomationNode | undefined = graph.nodes.find((entry) => entry.id === sendNodeId);
                if (send?.type !== NodeType.SEND_EMAIL || !ancestors(graph, node.id).has(sendNodeId)) {
                    throw badRequest(`${where}: it must wait on an email sent by an earlier step.`);
                }
                positive(config, "timeoutAmount", where, 365);
                unit(config, "timeoutUnit", where);
                break;
            }
            case NodeType.CONDITION:
                if (config.filter === undefined || config.filter === null) {
                    throw badRequest(`${where}: add the conditions to check.`);
                }
                references.filters.push(config.filter);
                break;
            case NodeType.SPLIT:
                positive(config, "percent", where, 99);
                break;
            case NodeType.SEND_EMAIL:
                references.templates.add(text(config, "templateUid", where, 64));
                references.senders.add(text(config, "senderUid", where, 64));
                if (config.subject !== undefined && config.subject !== null && config.subject !== "") {
                    text(config, "subject", where, 998);
                }
                break;
            case NodeType.SET_FIELD:
                if (!SETTABLE_FIELDS.includes(config.field as string)) {
                    throw badRequest(`${where}: choose the field to set.`);
                }
                if (config.value !== null && typeof config.value !== "string") {
                    throw badRequest(`${where}: 'value' must be text, or null to clear the field.`);
                }
                break;
            case NodeType.ADD_TAG:
            case NodeType.REMOVE_TAG:
                text(config, "tag", where, 64);
                break;
            case NodeType.SUBSCRIBE:
            case NodeType.UNSUBSCRIBE:
                references.lists.add(text(config, "listUid", where, 64));
                break;
            case NodeType.CREATE_TASK:
                text(config, "title", where, 256);
                if (config.dueInDays !== undefined && config.dueInDays !== null) {
                    positive(config, "dueInDays", where, 365);
                }
                if (config.assigneeUserUid) {
                    references.members.add(text(config, "assigneeUserUid", where, 64));
                }
                break;
            case NodeType.NOTIFY:
                references.members.add(text(config, "userUid", where, 64));
                text(config, "message", where, 1000);
                break;
            case NodeType.ENROLL:
                references.automations.add(text(config, "automationUid", where, 64));
                break;
            default:
                // EXIT has nothing to set.
                break;
        }
    }
    return references;
}

/** Every node from which `nodeId` can be reached. */
function ancestors(graph: AutomationGraph, nodeId: string): Set<string> {
    const found: Set<string> = new Set();
    const queue: string[] = [nodeId];
    while (queue.length > 0) {
        const current: string = queue.shift()!;
        for (const edge of graph.edges.filter((entry) => entry.to === current && !found.has(entry.from))) {
            found.add(edge.from);
            queue.push(edge.from);
        }
    }
    return found;
}

/** Refuses a loop with no delay or wait on it: with those taken out, the graph must have no cycle. */
function checkLoops(graph: AutomationGraph): void {
    const pausing: Set<string> = new Set(graph.nodes.filter((node) => node.type === NodeType.DELAY || node.type === NodeType.WAIT).map((node) => node.id));
    const state: Map<string, "visiting" | "done"> = new Map();
    const visit = (nodeId: string): void => {
        state.set(nodeId, "visiting");
        for (const edge of graph.edges.filter((entry) => entry.from === nodeId && !pausing.has(entry.to))) {
            if (state.get(edge.to) === "visiting") {
                throw badRequest(`Steps ${edge.from} and ${edge.to} loop without a delay or a wait.`);
            }
            if (!state.has(edge.to)) {
                visit(edge.to);
            }
        }
        state.set(nodeId, "done");
    };
    for (const node of graph.nodes) {
        if (!pausing.has(node.id) && !state.has(node.id)) {
            visit(node.id);
        }
    }
}
