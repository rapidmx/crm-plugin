///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import * as crypto from "crypto";
import { ModelUtils, NotificationUtils, RepoUtils } from "@rapidrest/service-core";
import { FilterNode, evaluateFilter } from "../filters/Filter.js";
import type { CrmModelClasses, CrmRepos } from "../models/CrmModelClasses.js";
import {
    Automation,
    AutomationReentry,
    AutomationStatus,
    AutomationVersion,
    CrmContact,
    CrmEvent,
    CrmObjectType,
    Enrollment,
    EnrollmentState,
    EnrollmentStep,
    EnrollmentWait,
    OutboundSend,
    SendSource,
    SendStatus,
    SubscriptionStatus,
    TaskPriority,
    TaskStatus,
    TimelineKind,
} from "../models/types.js";
import type { BaseContactRoute } from "../routes/BaseContactRoute.js";
import { contactFilterFields } from "../segments/Segments.js";
import { newSendToken } from "../sending/Tracking.js";
import { filterValues, readValues } from "../util/PropertyValues.js";
import { CrmEventType } from "./Events.js";
import { AutomationGraph, AutomationNode, NodeType, TIME_UNITS, nextNode } from "./Graph.js";

/** How many steps one run takes an enrollment through before handing it to the next run. */
export const STEPS_PER_RUN = 25;
/** How many steps an enrollment may take in all: a contact going round a loop this often has gone wrong. */
export const MAX_STEPS = 1000;
/** How many recent steps an enrollment keeps. */
export const HISTORY_SIZE = 50;

/** Whether `contact` matches the contact filter `filter` (checked in memory, as `compileFilter()` would in a query). */
export async function contactMatches(repos: CrmRepos, contact: CrmContact, filter: unknown): Promise<boolean> {
    const fields = await contactFilterFields(repos, contact.workspaceUid, true);
    const values = await readValues(await repos.get("propertyValue"), [contact.uid]);
    return evaluateFilter(filter as FilterNode, fields, contact as unknown as Record<string, unknown>, filterValues(values.get(contact.uid)));
}

/** Whether `event` starts an automation whose trigger step is `trigger` - before the trigger's contact filter, if it has one. */
export function triggerMatches(trigger: AutomationNode, event: Pick<CrmEvent, "type" | "data">): boolean {
    const config: Record<string, unknown> = trigger.config;
    if (config.event !== event.type || event.type === CrmEventType.MANUAL) {
        return false;
    }
    for (const field of ["listUid", "formUid", "segmentUid"] as const) {
        if (config[field] && config[field] !== event.data[field]) {
            return false;
        }
    }
    if (Array.isArray(config.fields) && config.fields.length > 0) {
        const changed: unknown[] = Array.isArray(event.data.fields) ? event.data.fields : [];
        return config.fields.some((field) => changed.includes(field));
    }
    return true;
}

/** A graph's trigger step. */
export function triggerOf(graph: AutomationGraph): AutomationNode | undefined {
    return graph.nodes.find((node) => node.type === NodeType.TRIGGER);
}

/** What the engine needs from its job or route. */
export interface EngineContext {
    repos: CrmRepos;
    classes: CrmModelClasses;
    /** The backend's contact route, for changes that must run the route's own logic (tags, subscriptions, the timeline). */
    contactRoute?: () => Promise<BaseContactRoute>;
    notificationUtils?: NotificationUtils;
    logger?: any;
}

/** One step's outcome: go on by `port`, stop here for now (`pause`), or finish. */
type StepResult = { port: string; outcome?: string } | { pause: { state: EnrollmentState; until: Date; waitFor: EnrollmentWait } } | { finish: EnrollmentState; outcome: string };

/**
 * Enrolls contacts in automations and takes them through their steps. Shared by the jobs (`AutomationTriggerJob`,
 * `AutomationRunJob`) and the automation route (enrolling by hand).
 */
export class AutomationEngine {
    constructor(private readonly context: EngineContext) {}

    private async repo<T>(name: keyof CrmModelClasses): Promise<RepoUtils<T & any>> {
        return await this.context.repos.get<T>(name);
    }

    /**
     * Puts `contactUid` into `automation`'s published version, at the step after its trigger - unless the automation's re-entry rule
     * says no (`never`: they were ever in it; `after_exit`: they are in it now). Returns the enrollment, or `undefined`.
     */
    public async enroll(automation: Automation, version: AutomationVersion, contactUid: string, outcome: string): Promise<Enrollment | undefined> {
        if (automation.status !== AutomationStatus.ACTIVE) {
            return undefined;
        }
        const graph: AutomationGraph = version.graph as AutomationGraph;
        const trigger: AutomationNode = triggerOf(graph)!;
        const enrollments: RepoUtils<Enrollment> = await this.repo<Enrollment>("enrollment");
        const earlier: Enrollment[] = await enrollments.find(
            {
                automationUid: ModelUtils.literal(automation.uid),
                contactUid: ModelUtils.literal(contactUid),
                ...(automation.reentry === AutomationReentry.AFTER_EXIT ? { state: ModelUtils.literal([EnrollmentState.ACTIVE, EnrollmentState.WAITING], "in") } : {}),
            },
            { ignoreACL: true, limit: 1, skipCache: true },
        );
        if (earlier.length > 0) {
            return undefined;
        }
        const now: Date = new Date();
        const enrollment: Enrollment = await enrollments.create(
            new this.context.classes.enrollment({
                workspaceUid: automation.workspaceUid,
                automationUid: automation.uid,
                versionUid: version.uid,
                contactUid,
                state: EnrollmentState.ACTIVE,
                currentNodeId: nextNode(graph, trigger.id)!,
                nextRunAt: now,
                steps: 1,
                history: [{ nodeId: trigger.id, at: now, outcome }],
                enteredAt: now,
            }),
            { ignoreACL: true, skipPush: true },
        );
        await this.timeline(automation.workspaceUid, contactUid, TimelineKind.AUTOMATION_ENTERED, `Entered the automation "${automation.name}"`, automation.uid);
        return enrollment;
    }

    /**
     * Takes a claimed enrollment through as many steps as it can now (at most `STEPS_PER_RUN`): up to a delay or a wait, or to the end.
     * Returns the enrollment's changes, to save with its lease released.
     */
    public async advance(enrollment: Enrollment, automation: Automation, graph: AutomationGraph): Promise<Partial<Enrollment>> {
        const history: EnrollmentStep[] = [...(enrollment.history ?? [])];
        let steps: number = enrollment.steps;
        let current: string = enrollment.currentNodeId;
        let waitFor: EnrollmentWait | undefined = enrollment.waitFor ?? undefined;
        const done = (state: EnrollmentState, error?: string): Partial<Enrollment> => ({
            state,
            currentNodeId: current,
            waitFor: null as any,
            history: history.slice(-HISTORY_SIZE),
            steps,
            finishedAt: new Date(),
            ...(error ? { error: error.slice(0, 1000) } : {}),
        });
        const contact: CrmContact | undefined = await (await this.repo<CrmContact>("contact")).findOne(enrollment.contactUid, { ignoreACL: true, skipCache: true });
        if (!contact) {
            return done(EnrollmentState.EXITED, "The contact was deleted.");
        }
        if (automation.goalFilter && (await contactMatches(this.context.repos, contact, automation.goalFilter))) {
            history.push({ nodeId: current, at: new Date(), outcome: "goal" });
            await this.finished(automation, contact.uid, "Reached the goal of");
            return done(EnrollmentState.COMPLETED);
        }
        for (let taken = 0; taken < STEPS_PER_RUN; taken++) {
            const node: AutomationNode | undefined = graph.nodes.find((entry) => entry.id === current);
            if (!node) {
                await this.finished(automation, contact.uid, "Finished");
                return done(EnrollmentState.COMPLETED);
            }
            if (steps >= MAX_STEPS) {
                return done(EnrollmentState.FAILED, `Gave up after ${MAX_STEPS} steps: the automation may loop.`);
            }
            let result: StepResult;
            try {
                result = await this.execute(node, enrollment, automation, contact.uid, waitFor);
            } catch (err: any) {
                history.push({ nodeId: node.id, at: new Date(), outcome: "error" });
                return done(EnrollmentState.FAILED, `Step ${node.id} failed: ${err?.message ?? err}`);
            }
            if ("pause" in result) {
                return {
                    state: result.pause.state,
                    currentNodeId: current,
                    nextRunAt: result.pause.until,
                    waitFor: result.pause.waitFor,
                    history: history.slice(-HISTORY_SIZE),
                    steps,
                };
            }
            steps++;
            history.push({ nodeId: node.id, at: new Date(), outcome: "finish" in result ? result.outcome : (result.outcome ?? result.port) });
            if ("finish" in result) {
                await this.finished(automation, contact.uid, "Finished");
                return done(result.finish);
            }
            const next: string | undefined = nextNode(graph, node.id, result.port);
            if (!next) {
                await this.finished(automation, contact.uid, "Finished");
                return done(EnrollmentState.COMPLETED);
            }
            current = next;
            waitFor = undefined;
        }
        return { state: EnrollmentState.ACTIVE, currentNodeId: current, nextRunAt: new Date(), waitFor: null as any, history: history.slice(-HISTORY_SIZE), steps };
    }

    /**
     * Resumes the enrollments of `event.contactUid` waiting for this event about this message, by their wait's `matched` way.
     * Returns how many were resumed.
     */
    public async resumeWaiting(event: Pick<CrmEvent, "type" | "contactUid" | "data">): Promise<number> {
        const sendUid: unknown = event.data.sendUid;
        if (typeof sendUid !== "string") {
            return 0;
        }
        const enrollments: RepoUtils<Enrollment> = await this.repo<Enrollment>("enrollment");
        const waiting: Enrollment[] = await enrollments.find(
            { contactUid: ModelUtils.literal(event.contactUid), state: ModelUtils.literal(EnrollmentState.WAITING) },
            { ignoreACL: true, limit: 100, skipCache: true },
        );
        let resumed: number = 0;
        const now: Date = new Date();
        for (const enrollment of waiting) {
            if (enrollment.waitFor?.sendUid !== sendUid || enrollment.waitFor.event !== event.type) {
                continue;
            }
            if (enrollment.leaseExpiresAt && new Date(enrollment.leaseExpiresAt).getTime() > now.getTime()) {
                continue;
            }
            const version: AutomationVersion | undefined = await (await this.repo<AutomationVersion>("automationVersion")).findOne(enrollment.versionUid, { ignoreACL: true });
            const graph: AutomationGraph | undefined = version?.graph as AutomationGraph | undefined;
            const next: string | undefined = graph ? nextNode(graph, enrollment.currentNodeId, "matched") : undefined;
            const step: EnrollmentStep = { nodeId: enrollment.currentNodeId, at: now, outcome: "matched" };
            try {
                await enrollments.update(
                    {
                        uid: enrollment.uid,
                        version: enrollment.version,
                        state: EnrollmentState.ACTIVE,
                        // With nowhere to go after a match, the next run finds no step and finishes the enrollment.
                        currentNodeId: next ?? "",
                        nextRunAt: now,
                        waitFor: null,
                        steps: enrollment.steps + 1,
                        history: [...(enrollment.history ?? []), step].slice(-HISTORY_SIZE),
                    } as any,
                    enrollment,
                    { ignoreACL: true, skipPush: true },
                );
                resumed++;
            } catch (err: any) {
                // The run job took it meanwhile (its wait timed out): the timeout way stands.
                this.context.logger?.debug?.(`AutomationEngine: enrollment ${enrollment.uid} changed meanwhile: ${err?.message ?? err}`);
            }
        }
        return resumed;
    }

    /** Runs one step. */
    private async execute(node: AutomationNode, enrollment: Enrollment, automation: Automation, contactUid: string, waitFor: EnrollmentWait | undefined): Promise<StepResult> {
        const config: Record<string, unknown> = node.config;
        const now: number = Date.now();
        const resuming: boolean = waitFor?.nodeId === node.id;
        switch (node.type) {
            case NodeType.DELAY:
                if (resuming) {
                    return { port: "next" };
                }
                return {
                    pause: { state: EnrollmentState.ACTIVE, until: new Date(now + Number(config.amount) * TIME_UNITS[String(config.unit)]), waitFor: { nodeId: node.id } },
                };
            case NodeType.WAIT: {
                if (resuming) {
                    // The run job only comes back to a waiting enrollment when its wait times out.
                    return { port: "timeout" };
                }
                const send: OutboundSend | undefined = await this.sendOf(enrollment, String(config.sendNodeId));
                if (send && happened(send, String(config.event))) {
                    return { port: "matched" };
                }
                return {
                    pause: {
                        state: EnrollmentState.WAITING,
                        until: new Date(now + Number(config.timeoutAmount) * TIME_UNITS[String(config.timeoutUnit)]),
                        waitFor: { nodeId: node.id, event: String(config.event), sendUid: send?.uid },
                    },
                };
            }
            case NodeType.CONDITION: {
                const contact: CrmContact = await this.contact(contactUid);
                return { port: (await contactMatches(this.context.repos, contact, config.filter)) ? "yes" : "no" };
            }
            case NodeType.SPLIT: {
                const hash: number = crypto.createHash("sha256").update(`${enrollment.uid}|${node.id}`).digest().readUInt32BE(0) % 100;
                return { port: hash < Number(config.percent) ? "a" : "b" };
            }
            case NodeType.SEND_EMAIL:
                await this.queueEmail(node, enrollment, automation, await this.contact(contactUid));
                return { port: "next", outcome: "sent" };
            case NodeType.SET_FIELD:
                await this.updateContact(contactUid, { [String(config.field)]: config.value });
                return { port: "next" };
            case NodeType.ADD_TAG:
            case NodeType.REMOVE_TAG: {
                const contact: CrmContact = await this.contact(contactUid);
                const tag: string = String(config.tag).trim().toLowerCase();
                const tags: string[] = node.type === NodeType.ADD_TAG ? [...new Set([...contact.tags, tag])] : contact.tags.filter((entry) => entry !== tag);
                if (tags.length !== contact.tags.length) {
                    await this.updateContact(contactUid, { tags });
                }
                return { port: "next" };
            }
            case NodeType.SUBSCRIBE:
            case NodeType.UNSUBSCRIBE:
                await (
                    await this.context.contactRoute!()
                ).setSubscription(automation.workspaceUid, String(config.listUid), contactUid, node.type === NodeType.SUBSCRIBE ? SubscriptionStatus.SUBSCRIBED : SubscriptionStatus.UNSUBSCRIBED, {
                    source: "automation",
                });
                return { port: "next" };
            case NodeType.CREATE_TASK:
                await (await this.repo("task")).create(
                    new this.context.classes.task({
                        workspaceUid: automation.workspaceUid,
                        title: String(config.title),
                        status: TaskStatus.OPEN,
                        priority: (config.priority as TaskPriority) ?? TaskPriority.NORMAL,
                        ...(config.dueInDays ? { dueAt: new Date(now + Number(config.dueInDays) * 86_400_000) } : {}),
                        ...(config.assigneeUserUid ? { assigneeUserUid: String(config.assigneeUserUid) } : {}),
                        subjectType: CrmObjectType.CONTACT,
                        subjectUid: contactUid,
                        createdByUserUid: automation.createdByUserUid,
                    }),
                    { ignoreACL: true, skipPush: true },
                );
                return { port: "next" };
            case NodeType.NOTIFY:
                this.context.notificationUtils?.sendMessage(String(config.userUid), "CrmAutomationNotice", "create", {
                    workspaceUid: automation.workspaceUid,
                    automationUid: automation.uid,
                    automationName: automation.name,
                    contactUid,
                    message: String(config.message),
                });
                return { port: "next" };
            case NodeType.ENROLL: {
                const target: Automation | undefined = await (await this.repo<Automation>("automation")).findOne(String(config.automationUid), { ignoreACL: true });
                const version: AutomationVersion | undefined = target?.publishedVersionUid
                    ? await (await this.repo<AutomationVersion>("automationVersion")).findOne(target.publishedVersionUid, { ignoreACL: true })
                    : undefined;
                const entered: Enrollment | undefined = target && version ? await this.enroll(target, version, contactUid, `from "${automation.name}"`) : undefined;
                return { port: "next", outcome: entered ? "enrolled" : "not enrolled" };
            }
            case NodeType.EXIT:
                return { finish: EnrollmentState.COMPLETED, outcome: "exit" };
            /* v8 ignore next 3 -- an enrollment starts after its trigger and never comes back to it (publishing forbids it) */
            default:
                return { port: "next" };
        }
    }

    /** The message this enrollment's `send_email` step `nodeId` queued, if it did. */
    private async sendOf(enrollment: Enrollment, nodeId: string): Promise<OutboundSend | undefined> {
        return (
            await (await this.repo<OutboundSend>("outboundSend")).find(
                { dedupeKey: ModelUtils.literal(`automation:${enrollment.uid}:${nodeId}`) },
                { ignoreACL: true, limit: 1, skipCache: true },
            )
        )[0];
    }

    /** Queues the step's email for the contact - once per enrollment and step, however often the step is run again. */
    private async queueEmail(node: AutomationNode, enrollment: Enrollment, automation: Automation, contact: CrmContact): Promise<void> {
        if (await this.sendOf(enrollment, node.id)) {
            return;
        }
        const subject: unknown = node.config.subject;
        await (await this.repo("outboundSend")).create(
            new this.context.classes.outboundSend({
                workspaceUid: automation.workspaceUid,
                sourceType: SendSource.AUTOMATION,
                sourceUid: automation.uid,
                dedupeKey: `automation:${enrollment.uid}:${node.id}`,
                contactUid: contact.uid,
                email: contact.email,
                variantId: "A",
                status: SendStatus.QUEUED,
                token: newSendToken(),
                nextAttemptAt: new Date(),
                nodeId: node.id,
                templateUid: String(node.config.templateUid),
                senderUid: String(node.config.senderUid),
                ...(typeof subject === "string" && subject.trim() ? { subject } : {}),
            }),
            { ignoreACL: true, skipPush: true },
        );
    }

    private async contact(contactUid: string): Promise<CrmContact> {
        const contact: CrmContact | undefined = await (await this.repo<CrmContact>("contact")).findOne(contactUid, { ignoreACL: true, skipCache: true });
        // `advance()` ends the run of a deleted contact first; this is a contact deleted during the run.
        /* v8 ignore if */
        if (!contact) {
            throw new Error("The contact was deleted.");
        }
        return contact;
    }

    /** Changes the contact through the contact route, so tags, the timeline and events follow as for any change. */
    private async updateContact(contactUid: string, body: Record<string, unknown>): Promise<void> {
        const contact: CrmContact = await this.contact(contactUid);
        await (await this.context.contactRoute!()).applyUpdate(contact.workspaceUid, "", contact, body);
    }

    private async finished(automation: Automation, contactUid: string, verb: string): Promise<void> {
        await this.timeline(automation.workspaceUid, contactUid, TimelineKind.AUTOMATION_FINISHED, `${verb} the automation "${automation.name}"`, automation.uid);
    }

    private async timeline(workspaceUid: string, contactUid: string, kind: TimelineKind, summary: string, refUid: string): Promise<void> {
        await (await this.repo("timelineEvent")).create(
            new this.context.classes.timelineEvent({ workspaceUid, subjectType: CrmObjectType.CONTACT, subjectUid: contactUid, kind, summary, occurredAt: new Date(), data: {}, refUid }),
            { ignoreACL: true, skipPush: true },
        );
    }
}

/** Whether what a wait waits for already happened to `send`. */
export function happened(send: OutboundSend, event: string): boolean {
    switch (event) {
        case CrmEventType.EMAIL_OPENED:
            return !!send.firstOpenedAt && !send.machineOpen;
        case CrmEventType.EMAIL_CLICKED:
            return !!send.firstClickedAt;
        default:
            return !!send.repliedAt;
    }
}
