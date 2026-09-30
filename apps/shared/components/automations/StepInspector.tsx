///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { ReactNode, useEffect, useId, useState } from "react";
import {
    Automation,
    AutomationGraph,
    AutomationNode,
    CrmForm,
    EmailTemplate,
    MailingList,
    Pipeline,
    Segment,
    WorkspaceMember,
    WebhookEndpoint,
    WorkspaceSender,
    listAutomations,
    listForms,
    listLists,
    listMembers,
    listPipelines,
    listSegments,
    listSenders,
    listWebhooks,
    searchTemplates,
} from "../../crmApi.js";
import { LIFECYCLE_STAGES } from "../../fields.js";
import { INPUT_CLASS, useCrm } from "../CrmShell.js";
import FilterBuilder, { buildFilter, draftOf } from "../FilterBuilder.js";
import { useSegmentFields } from "../SegmentManager.js";
import { earlierSends, stepLabel } from "./flowModel.js";

/** What the step settings pick from: the workspace's lists, forms, segments, templates, senders, members, automations, pipelines and webhooks. */
export interface AutomationData {
    lists: MailingList[];
    forms: CrmForm[];
    segments: Segment[];
    templates: EmailTemplate[];
    senders: WorkspaceSender[];
    members: WorkspaceMember[];
    automations: Automation[];
    pipelines: Pipeline[];
    webhooks: WebhookEndpoint[];
}

const EMPTY: AutomationData = { lists: [], forms: [], segments: [], templates: [], senders: [], members: [], automations: [], pipelines: [], webhooks: [] };

/** Loads what the step settings pick from. Anything that fails to load is left empty. */
export function useAutomationData(): AutomationData {
    const { workspace } = useCrm();
    const [data, setData] = useState<AutomationData>(EMPTY);
    useEffect(() => {
        const settle = <T,>(promise: Promise<T>, fallback: T): Promise<T> => promise.catch(() => fallback);
        void Promise.all([
            settle(listLists(workspace.uid), []),
            settle(listForms(workspace.uid), []),
            settle(listSegments(workspace.uid), []),
            settle(
                searchTemplates(workspace.uid, 0, 200).then((result) => result.items),
                [],
            ),
            settle(listSenders(workspace.uid), []),
            settle(listMembers(workspace.uid), []),
            settle(listAutomations(workspace.uid), []),
            settle(listPipelines(workspace.uid), []),
            settle(listWebhooks(workspace.uid), []),
        ]).then(([lists, forms, segments, templates, senders, members, automations, pipelines, webhooks]) =>
            setData({ lists, forms, segments, templates, senders, members, automations, pipelines, webhooks }),
        );
    }, [workspace.uid]);
    return data;
}

/** What each trigger event is called. */
export const TRIGGER_EVENTS: { value: string; label: string }[] = [
    { value: "list.subscribed", label: "Subscribes to a list" },
    { value: "list.unsubscribed", label: "Unsubscribes from a list" },
    { value: "form.submitted", label: "Submits a form" },
    { value: "segment.entered", label: "Enters a segment" },
    { value: "segment.left", label: "Leaves a segment" },
    { value: "contact.created", label: "Is created" },
    { value: "contact.updated", label: "Is changed" },
    { value: "email.opened", label: "Opens an email" },
    { value: "email.clicked", label: "Clicks a link in an email" },
    { value: "email.replied", label: "Replies to an email" },
    { value: "email.bounced", label: "Has an email bounce" },
    { value: "email.unsubscribed", label: "Unsubscribes through an email" },
    { value: "deal.created", label: "Gets a new deal" },
    { value: "deal.stage_changed", label: "Has a deal move to another stage" },
    { value: "deal.won", label: "Has a deal won" },
    { value: "deal.lost", label: "Has a deal lost" },
    { value: "date.reached", label: "Reaches a date (birthday, renewal, anniversary…)" },
    { value: "custom", label: "Has an event reported by your systems (API)" },
    { value: "manual", label: "Is put in by hand (or by another automation)" },
];

export const WAIT_EVENTS: { value: string; label: string }[] = [
    { value: "email.opened", label: "Opens" },
    { value: "email.clicked", label: "Clicks a link in" },
    { value: "email.replied", label: "Replies to" },
];

const UNITS: { value: string; label: string }[] = [
    { value: "minutes", label: "minutes" },
    { value: "hours", label: "hours" },
    { value: "days", label: "days" },
];

/** The contact's own dates a date trigger can start from, besides its date properties. */
export const OWN_DATES: { value: string; label: string }[] = [
    { value: "dateCreated", label: "Date added" },
    { value: "lastEngagedAt", label: "Last engaged" },
];

const DATE_WHEN: { value: string; label: string }[] = [
    { value: "on", label: "On the date" },
    { value: "before", label: "Days before" },
    { value: "after", label: "Days after" },
];

const REPEATS: { value: string; label: string }[] = [
    { value: "yearly", label: "Every year" },
    { value: "once", label: "Once" },
];

/** `hour` as a time of day ("09:00"). */
export function hourLabel(hour: number): string {
    return `${String(hour).padStart(2, "0")}:00`;
}

const HOURS: { value: string; label: string }[] = Array.from({ length: 24 }, (_value, hour) => ({ value: String(hour), label: hourLabel(hour) }));

/** A date trigger's settings: the date, days before or after it, every year or once, and from what hour. */
function DateSettings({ config, onChange }: { config: Record<string, unknown>; onChange: (patch: Record<string, unknown>) => void }) {
    const fields = useSegmentFields();
    const dates = [...OWN_DATES, ...fields.filter((field) => field.kind === "date" && field.name.startsWith("properties.")).map((field) => ({ value: field.name, label: field.label }))];
    const offset: number = typeof config.offsetDays === "number" ? config.offsetDays : 0;
    const when: string = offset < 0 ? "before" : offset > 0 ? "after" : "on";
    return (
        <>
            <Select label="Date" value={config.dateField} options={dates} empty="Choose a date…" onChange={(dateField) => onChange({ dateField: dateField || undefined })} />
            <Select label="When" value={when} options={DATE_WHEN} onChange={(next) => onChange({ offsetDays: next === "on" ? 0 : (next === "before" ? -1 : 1) * Math.max(1, Math.abs(offset)) })} />
            {when !== "on" && <WholeNumber label="Days" value={Math.abs(offset)} onChange={(days) => onChange({ offsetDays: (when === "before" ? -1 : 1) * Math.min(365, Math.max(1, days ?? 1)) })} />}
            <Select label="Repeat" value={config.repeat ?? "yearly"} options={REPEATS} onChange={(repeat) => onChange({ repeat })} />
            <Select label="From (workspace time)" value={String(config.hour ?? 9)} options={HOURS} onChange={(hour) => onChange({ hour: Number(hour) })} />
            <p className="text-xs text-text-muted mb-3">
                Contacts are put in once a day. For a date that comes round every year, let contacts go through again (the automation's settings) or they only
                get it the first time.
            </p>
        </>
    );
}

const SETTABLE: { value: string; label: string }[] = [
    { value: "lifecycleStage", label: "Lifecycle stage" },
    { value: "leadStatus", label: "Lead status" },
    { value: "ownerUserUid", label: "Owner" },
];

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
    const id: string = useId();
    return (
        <div className="mb-3">
            <label htmlFor={id} className="block text-xs font-semibold text-text-muted mb-1">
                {label}
            </label>
            {children(id)}
        </div>
    );
}

function Select({ label, value, options, onChange, empty }: { label: string; value: unknown; options: { value: string; label: string }[]; onChange: (value: string) => void; empty?: string }) {
    return (
        <Field label={label}>
            {(id) => (
                <select id={id} className={INPUT_CLASS} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
                    {empty !== undefined && <option value="">{empty}</option>}
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            )}
        </Field>
    );
}

function Text({ label, value, onChange, type = "text" }: { label: string; value: unknown; onChange: (value: string) => void; type?: string }) {
    return <Field label={label}>{(id) => <input id={id} type={type} className={INPUT_CLASS} value={value === undefined || value === null ? "" : String(value)} onChange={(event) => onChange(event.target.value)} />}</Field>;
}

/** A whole number setting; emptying it clears it. */
function WholeNumber({ label, value, onChange }: { label: string; value: unknown; onChange: (value: number | undefined) => void }) {
    return <Text label={label} type="number" value={value} onChange={(raw) => onChange(raw === "" ? undefined : Math.max(0, Math.round(Number(raw))))} />;
}

/** A contact filter setting, edited with the filter builder. */
function Conditions({ label, value, onChange }: { label: string; value: unknown; onChange: (filter: unknown) => void }) {
    const fields = useSegmentFields(true);
    const [draft, setDraft] = useState(() => draftOf(value as any));
    return (
        <div className="mb-3">
            <div className="text-xs font-semibold text-text-muted mb-1">{label}</div>
            <FilterBuilder
                fields={fields}
                draft={draft}
                onChange={(next) => {
                    setDraft(next);
                    onChange(buildFilter(next, fields) ?? null);
                }}
            />
        </div>
    );
}

const names = (records: { uid: string; name: string }[]) => records.map((record) => ({ value: record.uid, label: record.name }));

/** The settings of one step. `onChange` gets the settings to merge into the step's. */
export default function StepInspector({
    node,
    graph,
    automationUid,
    data,
    onChange,
}: {
    node: AutomationNode;
    graph: AutomationGraph;
    automationUid: string;
    data: AutomationData;
    onChange: (patch: Record<string, unknown>) => void;
}) {
    const config = node.config;
    const set = (field: string) => (value: unknown) => onChange({ [field]: value === "" ? undefined : value });
    const members = data.members.map((member) => ({ value: member.userUid, label: member.displayName || member.address || member.userUid }));
    let fields: ReactNode;
    switch (node.type) {
        case "trigger":
            fields = (
                <>
                    <Select label="When a contact" value={config.event} options={TRIGGER_EVENTS} onChange={(event) => onChange({ event, listUid: undefined, formUid: undefined, segmentUid: undefined, pipelineUid: undefined, stageId: undefined, fields: undefined, name: undefined, ...(event === "date.reached" ? { repeat: "yearly", offsetDays: 0, hour: 9 } : { dateField: undefined, repeat: undefined, offsetDays: undefined, hour: undefined }) })} />
                    {config.event === "date.reached" && <DateSettings config={config} onChange={onChange} />}
                    {config.event === "custom" && <Text label="Event name (empty: any event)" value={config.name} onChange={set("name")} />}
                    {(config.event === "list.subscribed" || config.event === "list.unsubscribed") && (
                        <Select label="List" value={config.listUid} options={names(data.lists)} empty="Any list" onChange={set("listUid")} />
                    )}
                    {config.event === "form.submitted" && <Select label="Form" value={config.formUid} options={names(data.forms)} empty="Any form" onChange={set("formUid")} />}
                    {(config.event === "segment.entered" || config.event === "segment.left") && (
                        <Select label="Segment" value={config.segmentUid} options={names(data.segments)} empty="Any segment" onChange={set("segmentUid")} />
                    )}
                    {String(config.event).startsWith("deal.") && (
                        <>
                            <Select label="Pipeline" value={config.pipelineUid} options={names(data.pipelines)} empty="Any pipeline" onChange={(pipelineUid) => onChange({ pipelineUid: pipelineUid || undefined, stageId: undefined })} />
                            {config.event === "deal.stage_changed" && config.pipelineUid && (
                                <Select
                                    label="Moved to"
                                    value={config.stageId}
                                    options={(data.pipelines.find((pipeline) => pipeline.uid === config.pipelineUid)?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name }))}
                                    empty="Any stage"
                                    onChange={set("stageId")}
                                />
                            )}
                        </>
                    )}
                    {config.event === "contact.updated" && (
                        <Text
                            label="Only when these fields change (comma-separated, empty: any)"
                            value={Array.isArray(config.fields) ? config.fields.join(", ") : ""}
                            onChange={(raw) => {
                                const list: string[] = raw.split(",").map((entry) => entry.trim()).filter(Boolean);
                                onChange({ fields: list.length > 0 ? list : undefined });
                            }}
                        />
                    )}
                    <Conditions key={`${node.id}-trigger`} label="Only contacts matching (optional)" value={config.filter} onChange={(filter) => onChange({ filter: filter ?? undefined })} />
                </>
            );
            break;
        case "delay":
            fields = (
                <div className="flex gap-2">
                    <WholeNumber label="Wait" value={config.amount} onChange={set("amount")} />
                    <Select label="Unit" value={config.unit} options={UNITS} onChange={set("unit")} />
                </div>
            );
            break;
        case "wait":
            fields = (
                <>
                    <Select label="Until the contact" value={config.event} options={WAIT_EVENTS} onChange={set("event")} />
                    <Select
                        label="The email sent by"
                        value={config.sendNodeId}
                        options={earlierSends(graph, node.id).map((send) => ({ value: send.id, label: send.id }))}
                        empty="Choose an earlier email step…"
                        onChange={set("sendNodeId")}
                    />
                    <div className="flex gap-2">
                        <WholeNumber label="At most" value={config.timeoutAmount} onChange={set("timeoutAmount")} />
                        <Select label="Unit" value={config.timeoutUnit} options={UNITS} onChange={set("timeoutUnit")} />
                    </div>
                </>
            );
            break;
        case "condition":
            fields = <Conditions key={node.id} label="Is the contact matching" value={config.filter} onChange={set("filter")} />;
            break;
        case "split":
            fields = <WholeNumber label="Share taking path A (%)" value={config.percent} onChange={set("percent")} />;
            break;
        case "send_email":
            fields = (
                <>
                    <Select label="Email" value={config.templateUid} options={names(data.templates)} empty="Choose a template…" onChange={set("templateUid")} />
                    <Select
                        label="From"
                        value={config.senderUid}
                        options={data.senders.map((sender) => ({ value: sender.uid, label: sender.fromName ? `${sender.fromName} <${sender.fromAddress}>` : sender.fromAddress }))}
                        empty="Choose a sender…"
                        onChange={set("senderUid")}
                    />
                    <Text label="Subject (empty: the template's)" value={config.subject} onChange={set("subject")} />
                </>
            );
            break;
        case "set_field":
            fields = (
                <>
                    <Select label="Field" value={config.field} options={SETTABLE} onChange={(field) => onChange({ field, value: null })} />
                    {config.field === "lifecycleStage" ? (
                        <Select label="Value" value={config.value} options={LIFECYCLE_STAGES} onChange={set("value")} />
                    ) : config.field === "ownerUserUid" ? (
                        <Select label="Member" value={config.value} options={members} empty="Nobody" onChange={(value) => onChange({ value: value || null })} />
                    ) : (
                        <Text label="Value" value={config.value} onChange={(value) => onChange({ value: value || null })} />
                    )}
                </>
            );
            break;
        case "add_tag":
        case "remove_tag":
            fields = <Text label="Tag" value={config.tag} onChange={set("tag")} />;
            break;
        case "subscribe":
        case "unsubscribe":
            fields = <Select label="List" value={config.listUid} options={names(data.lists)} empty="Choose a list…" onChange={set("listUid")} />;
            break;
        case "create_task":
            fields = (
                <>
                    <Text label="Title" value={config.title} onChange={set("title")} />
                    <WholeNumber label="Due in (days, empty: no due date)" value={config.dueInDays} onChange={set("dueInDays")} />
                    <Select label="Assigned to" value={config.assigneeUserUid} options={members} empty="Nobody" onChange={set("assigneeUserUid")} />
                </>
            );
            break;
        case "notify":
            fields = (
                <>
                    <Select label="Member" value={config.userUid} options={members} empty="Choose a member…" onChange={set("userUid")} />
                    <Text label="Message" value={config.message} onChange={set("message")} />
                </>
            );
            break;
        case "enroll":
            fields = (
                <Select
                    label="Automation"
                    value={config.automationUid}
                    options={names(data.automations.filter((automation) => automation.uid !== automationUid))}
                    empty="Choose an automation…"
                    onChange={set("automationUid")}
                />
            );
            break;
        case "webhook":
            fields = (
                <>
                    <Select
                        label="Webhook"
                        value={config.endpointUid}
                        options={data.webhooks.map((endpoint) => ({ value: endpoint.uid, label: endpoint.description || endpoint.url }))}
                        empty="Choose a webhook…"
                        onChange={set("endpointUid")}
                    />
                    <p className="text-xs text-text-muted">
                        Posts an <code>automation.webhook</code> event about the contact. Add webhooks under Integrations.
                    </p>
                </>
            );
            break;
        default:
            fields = <p className="text-sm text-text-muted">The contact leaves the automation here.</p>;
    }
    return (
        <div>
            <h2 className="text-sm font-semibold mb-1">{stepLabel(node.type)}</h2>
            <p className="text-xs text-text-muted mb-3">Step {node.id}</p>
            {fields}
        </div>
    );
}
