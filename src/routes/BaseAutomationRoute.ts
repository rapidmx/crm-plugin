///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils, RepoUtils, RouteDecorators } from "@rapidrest/service-core";
import type { JWTUser } from "@rapidrest/core";
import { AutomationEngine } from "../automation/Engine.js";
import { AutomationGraph, GraphReferences, NodeType, validateForPublish, validateGraph } from "../automation/Graph.js";
import { CrmEventType } from "../automation/Events.js";
import { FilterNode, validateFilter } from "../filters/Filter.js";
import {
    Automation,
    AutomationReentry,
    AutomationStatus,
    AutomationVersion,
    CrmContact,
    Enrollment,
    EnrollmentState,
    OutboundSend,
    WorkspaceAction,
} from "../models/types.js";
import { contactFilterFields } from "../segments/Segments.js";
import { badRequest, readEnum, readPaging, readText, requireObject } from "../util/Validation.js";
import { notFound } from "../util/WorkspaceAccess.js";
import { BaseWorkspaceRecordRoute, SearchResult, WriteContext } from "./BaseWorkspaceRecordRoute.js";
const { Get, Param, Post, User: AuthUser } = RouteDecorators;

/** How many automations one workspace may have. */
export const MAX_AUTOMATIONS = 200;
/** How many contacts one request may enroll by hand. */
export const MAX_MANUAL_ENROLL = 500;

/** A new automation's draft: a trigger, waiting to be set up. */
function starterGraph(): AutomationGraph {
    return { nodes: [{ id: "trigger", type: NodeType.TRIGGER, config: { event: CrmEventType.LIST_SUBSCRIBED } }], edges: [] };
}

/** An enrollment as a list shows it: with its contact's address. */
export interface EnrollmentView extends Enrollment {
    email?: string;
}

/** An automation's numbers: enrollments by state, who is at each step now, and each email step's results. */
export interface AutomationReport {
    states: Record<EnrollmentState, number>;
    nodes: Record<string, { current: number; sent?: number; opened?: number; clicked?: number; replied?: number }>;
}

/**
 * A workspace's automations (`/api/mail/crm/automations`) - see `BaseWorkspaceRecordRoute` for the endpoints; the draft `graph`,
 * `reentry` and `goalFilter` change with `PUT` - plus:
 * - `POST /:workspaceUid/:uid/publish` - checks the draft (`validateForPublish()` and that everything it names exists) and makes it
 * the version new enrollments go through; the automation becomes active.
 * - `POST /:workspaceUid/:uid/pause` and `.../resume`.
 * - `POST /:workspaceUid/:uid/enroll` - `{ contactUids }`: puts contacts in by hand (an active automation, as its re-entry rule allows).
 * - `GET /:workspaceUid/:uid/report` - `AutomationReport`.
 * - `POST /:workspaceUid/:uid/enrollments` - `{ state?, contactUid?, limit?, page? }` to a page of enrollments.
 * - `POST /:workspaceUid/:uid/enrollments/:enrollmentUid/exit` - takes one contact out.
 */
export abstract class BaseAutomationRoute extends BaseWorkspaceRecordRoute<Automation> {
    protected readonly model = "automation" as const;
    protected readonly pushType: string = "CrmAutomation";
    protected override readonly sortFields: readonly string[] = ["name"];
    protected override readonly maxRecords: number = MAX_AUTOMATIONS;

    protected async readCreate(body: Record<string, unknown>, context: WriteContext): Promise<Partial<Automation>> {
        return {
            name: readText(body, "name", { required: true })!,
            description: readText(body, "description", { max: 2000 }) ?? undefined,
            status: AutomationStatus.DRAFT,
            graph: body.graph === undefined ? starterGraph() : validateGraph(body.graph),
            reentry: readEnum(body, "reentry", Object.values(AutomationReentry)) ?? AutomationReentry.NEVER,
            ...(body.goalFilter !== undefined && body.goalFilter !== null ? { goalFilter: await this.readContactFilter(context.workspaceUid, body.goalFilter) } : {}),
            createdByUserUid: context.user.uid,
        };
    }

    protected async readUpdate(body: Record<string, unknown>, _existing: Automation, context: WriteContext): Promise<Partial<Automation>> {
        const fields: Record<string, unknown> = {};
        const name: string | null | undefined = readText(body, "name");
        if (name === null) {
            throw badRequest("'name' is required.");
        }
        if (name !== undefined) {
            fields.name = name;
        }
        if (body.description !== undefined) {
            fields.description = readText(body, "description", { max: 2000 });
        }
        if (body.graph !== undefined) {
            fields.graph = validateGraph(body.graph);
        }
        const reentry = readEnum(body, "reentry", Object.values(AutomationReentry));
        if (reentry) {
            fields.reentry = reentry;
        }
        if (body.goalFilter !== undefined) {
            fields.goalFilter = body.goalFilter === null ? null : await this.readContactFilter(context.workspaceUid, body.goalFilter);
        }
        return fields;
    }

    private async readContactFilter(workspaceUid: string, raw: unknown): Promise<FilterNode> {
        return validateFilter(raw, await contactFilterFields(this.repos(), workspaceUid, true));
    }

    protected override async afterDelete(record: Automation): Promise<void> {
        for (const name of ["automationVersion", "enrollment"] as const) {
            await (await this.repo(name)).truncate({ automationUid: ModelUtils.literal(record.uid) }, { ignoreACL: true, skipPush: true });
        }
    }

    private async requireAutomation(user: JWTUser | undefined, workspaceUid: string, uid: string, action: WorkspaceAction): Promise<Automation> {
        await this.requireAccess(user, workspaceUid, action);
        return await this.requireRecord(workspaceUid, uid);
    }

    /** Refuses (400) a published graph naming something the workspace doesn't have. */
    private async checkReferences(automation: Automation, references: GraphReferences): Promise<void> {
        const workspaceUid: string = automation.workspaceUid;
        const exists = async (name: "template" | "workspaceSender" | "form" | "segment" | "automation" | "pipeline" | "webhookEndpoint", uid: string): Promise<boolean> => {
            const record: { workspaceUid: string } | undefined = await (await this.repo(name)).findOne(uid, { ignoreACL: true, skipCache: true });
            return record?.workspaceUid === workspaceUid;
        };
        const checks: [Set<string>, (uid: string) => Promise<boolean>, string][] = [
            [references.templates, (uid) => exists("template", uid), "an email template"],
            [references.senders, (uid) => exists("workspaceSender", uid), "a sender"],
            [references.lists, async (uid) => !!(await this.findList(workspaceUid, uid)), "a list"],
            [references.forms, (uid) => exists("form", uid), "a form"],
            [references.segments, (uid) => exists("segment", uid), "a segment"],
            [references.automations, async (uid) => uid !== automation.uid && (await exists("automation", uid)), "another automation"],
            [references.members, async (uid) => !!(await this.findMember(workspaceUid, uid)), "a member of the workspace"],
            [references.pipelines, (uid) => exists("pipeline", uid), "a pipeline"],
            [references.webhooks, (uid) => exists("webhookEndpoint", uid), "a webhook"],
        ];
        for (const [uids, check, noun] of checks) {
            for (const uid of uids) {
                if (!(await check(uid))) {
                    throw badRequest(`A step names ${noun} that doesn't exist: ${uid}.`);
                }
            }
        }
        for (const filter of references.filters) {
            await this.readContactFilter(workspaceUid, filter);
        }
    }

    @Post("/:workspaceUid/:uid/publish")
    public async publish(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<Automation> {
        const automation: Automation = await this.requireAutomation(user, workspaceUid, uid, WorkspaceAction.WRITE);
        const graph: AutomationGraph = validateGraph(automation.graph);
        await this.checkReferences(automation, validateForPublish(graph));
        const versions: RepoUtils<AutomationVersion> = await this.repo<AutomationVersion>("automationVersion");
        const count: number = await versions.count({ automationUid: ModelUtils.literal(automation.uid) }, { ignoreACL: true, skipCache: true });
        const version: AutomationVersion = await versions.create(
            new this.classes.automationVersion({ workspaceUid, automationUid: automation.uid, versionNumber: count + 1, graph, publishedByUserUid: user!.uid }),
            { ignoreACL: true, skipPush: true },
        );
        return await this.transition(automation, { status: AutomationStatus.ACTIVE, publishedVersionUid: version.uid, publishedAt: new Date() });
    }

    @Post("/:workspaceUid/:uid/pause")
    public async pause(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<Automation> {
        const automation: Automation = await this.requireAutomation(user, workspaceUid, uid, WorkspaceAction.WRITE);
        if (automation.status !== AutomationStatus.ACTIVE) {
            throw badRequest("Only an active automation can be paused.");
        }
        return await this.transition(automation, { status: AutomationStatus.PAUSED });
    }

    @Post("/:workspaceUid/:uid/resume")
    public async resume(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<Automation> {
        const automation: Automation = await this.requireAutomation(user, workspaceUid, uid, WorkspaceAction.WRITE);
        if (automation.status !== AutomationStatus.PAUSED) {
            throw badRequest("Only a paused automation can be resumed.");
        }
        return await this.transition(automation, { status: AutomationStatus.ACTIVE });
    }

    @Post("/:workspaceUid/:uid/enroll")
    public async enroll(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, body: unknown, @AuthUser user?: JWTUser): Promise<{ enrolled: number }> {
        const automation: Automation = await this.requireAutomation(user, workspaceUid, uid, WorkspaceAction.WRITE);
        const request: Record<string, unknown> = requireObject(body);
        if (!Array.isArray(request.contactUids) || request.contactUids.length === 0 || request.contactUids.length > MAX_MANUAL_ENROLL) {
            throw badRequest(`'contactUids' must be a list of 1 to ${MAX_MANUAL_ENROLL} contact uids.`);
        }
        if (automation.status !== AutomationStatus.ACTIVE) {
            throw badRequest("Contacts can only be put into an active automation.");
        }
        const version: AutomationVersion = (await (await this.repo<AutomationVersion>("automationVersion")).findOne(automation.publishedVersionUid!, { ignoreACL: true }));
        const contacts: CrmContact[] = await (await this.repo<CrmContact>("contact")).find(
            { workspaceUid: ModelUtils.literal(workspaceUid), uid: ModelUtils.literal(request.contactUids.filter((entry) => typeof entry === "string"), "in") },
            { ignoreACL: true, limit: MAX_MANUAL_ENROLL, skipCache: true },
        );
        const engine = new AutomationEngine({ repos: this.repos(), classes: this.classes, logger: this.logger });
        let enrolled: number = 0;
        for (const contact of contacts) {
            enrolled += (await engine.enroll(automation, version, contact.uid, CrmEventType.MANUAL)) ? 1 : 0;
        }
        return { enrolled };
    }

    @Get("/:workspaceUid/:uid/report")
    public async report(@Param("workspaceUid") workspaceUid: string, @Param("uid") uid: string, @AuthUser user?: JWTUser): Promise<AutomationReport> {
        const automation: Automation = await this.requireAutomation(user, workspaceUid, uid, WorkspaceAction.READ);
        const enrollments: RepoUtils<Enrollment> = await this.repo<Enrollment>("enrollment");
        const scope = { automationUid: ModelUtils.literal(automation.uid) };
        const states = {} as Record<EnrollmentState, number>;
        for (const state of Object.values(EnrollmentState)) {
            states[state] = await enrollments.count({ ...scope, state: ModelUtils.literal(state) }, { ignoreACL: true, skipCache: true });
        }
        const nodes: AutomationReport["nodes"] = {};
        const version: AutomationVersion | undefined = automation.publishedVersionUid
            ? await (await this.repo<AutomationVersion>("automationVersion")).findOne(automation.publishedVersionUid, { ignoreACL: true })
            : undefined;
        const sends: RepoUtils<OutboundSend> = await this.repo<OutboundSend>("outboundSend");
        for (const node of (version?.graph as AutomationGraph | undefined)?.nodes ?? []) {
            nodes[node.id] = {
                current: await enrollments.count(
                    { ...scope, currentNodeId: ModelUtils.literal(node.id), state: ModelUtils.literal([EnrollmentState.ACTIVE, EnrollmentState.WAITING], "in") },
                    { ignoreACL: true, skipCache: true },
                ),
            };
            if (node.type === NodeType.SEND_EMAIL) {
                const count = async (extra: Record<string, unknown>) =>
                    await sends.count({ sourceUid: ModelUtils.literal(automation.uid), nodeId: ModelUtils.literal(node.id), ...extra }, { ignoreACL: true, skipCache: true });
                const notNull = () => ModelUtils.literal(null, "ne");
                nodes[node.id].sent = await count({ sentAt: notNull() });
                nodes[node.id].opened = await count({ firstOpenedAt: notNull(), machineOpen: ModelUtils.literal(false) });
                nodes[node.id].clicked = await count({ firstClickedAt: notNull() });
                nodes[node.id].replied = await count({ repliedAt: notNull() });
            }
        }
        return { states, nodes };
    }

    @Post("/:workspaceUid/:uid/enrollments")
    public async enrollments(
        @Param("workspaceUid") workspaceUid: string,
        @Param("uid") uid: string,
        body: unknown,
        @AuthUser user?: JWTUser,
    ): Promise<SearchResult<EnrollmentView>> {
        const automation: Automation = await this.requireAutomation(user, workspaceUid, uid, WorkspaceAction.READ);
        const request: Record<string, unknown> = body === undefined ? {} : requireObject(body);
        const paging = readPaging(request.limit, request.page);
        const state = readEnum(request, "state", Object.values(EnrollmentState));
        const contactUid: string | null | undefined = readText(request, "contactUid", { max: 64 });
        const query: Record<string, unknown> = {
            automationUid: ModelUtils.literal(automation.uid),
            ...(state ? { state: ModelUtils.literal(state) } : {}),
            ...(contactUid ? { contactUid: ModelUtils.literal(contactUid) } : {}),
        };
        const repo: RepoUtils<Enrollment> = await this.repo<Enrollment>("enrollment");
        const total: number = await repo.count(query, { ignoreACL: true, skipCache: true });
        const items: Enrollment[] = await repo.find({ ...query, sort: { enteredAt: "DESC" } }, { ignoreACL: true, limit: paging.limit, page: paging.page, skipCache: true });
        const contacts: CrmContact[] =
            items.length === 0
                ? []
                : await (await this.repo<CrmContact>("contact")).find(
                      { uid: ModelUtils.literal([...new Set(items.map((item) => item.contactUid))], "in") },
                      { ignoreACL: true, limit: items.length, skipCache: true },
                  );
        return {
            items: items.map((item) => ({ ...JSON.parse(JSON.stringify(item)), email: contacts.find((contact) => contact.uid === item.contactUid)?.email })),
            total,
        };
    }

    @Post("/:workspaceUid/:uid/enrollments/:enrollmentUid/exit")
    public async exitEnrollment(
        @Param("workspaceUid") workspaceUid: string,
        @Param("uid") uid: string,
        @Param("enrollmentUid") enrollmentUid: string,
        @AuthUser user?: JWTUser,
    ): Promise<Enrollment> {
        const automation: Automation = await this.requireAutomation(user, workspaceUid, uid, WorkspaceAction.WRITE);
        const repo: RepoUtils<Enrollment> = await this.repo<Enrollment>("enrollment");
        const enrollment: Enrollment | undefined =
            typeof enrollmentUid === "string" && enrollmentUid.length <= 64 ? await repo.findOne(enrollmentUid, { ignoreACL: true, skipCache: true }) : undefined;
        if (!enrollment || enrollment.automationUid !== automation.uid) {
            throw notFound();
        }
        if (enrollment.state !== EnrollmentState.ACTIVE && enrollment.state !== EnrollmentState.WAITING) {
            throw badRequest("Only a contact still in the automation can be taken out.");
        }
        const updated: Enrollment = await repo.update(
            { uid: enrollment.uid, version: enrollment.version, state: EnrollmentState.EXITED, finishedAt: new Date(), waitFor: null, error: "Taken out by a member." } as any,
            enrollment,
            { ignoreACL: true, skipPush: true },
        );
        return JSON.parse(JSON.stringify(updated));
    }

    private async transition(automation: Automation, changes: Partial<Automation>): Promise<Automation> {
        const updated: Automation = await (await this.records()).update({ ...changes, uid: automation.uid, version: automation.version }, automation, {
            ignoreACL: true,
            skipPush: true,
        });
        const view: Automation = JSON.parse(JSON.stringify(updated));
        this.notify(automation.workspaceUid, this.pushType, "update", view);
        return view;
    }
}
