///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import {
    Automation,
    AutomationGraph,
    AutomationNode,
    AutomationReport,
    Enrollment,
    EnrollmentState,
    NodeType,
    automationReport,
    changeAutomation,
    errorMessage,
    exitEnrollment,
    getAutomation,
    listEnrollments,
    updateAutomation,
} from "../../crmApi.js";
import { INPUT_CLASS, useCrm } from "../CrmShell.js";
import FilterBuilder, { buildFilter, draftOf } from "../FilterBuilder.js";
import { useSegmentFields } from "../SegmentManager.js";
import { FlowStep, PORT_LABELS, STEP_TYPES, configure, connect, insertStep, layout, removeStep, stepLabel } from "./flowModel.js";
import StepInspector, { AutomationData, OWN_DATES, TRIGGER_EVENTS, hourLabel, useAutomationData } from "./StepInspector.js";

const STATUS_LABELS: Record<string, string> = { draft: "Draft", active: "Active", paused: "Paused" };

/** A date trigger in a sentence: "7 days before Birthday, every year, from 09:00". */
export function describeDateTrigger(config: Record<string, unknown>): string {
    const field: string = typeof config.dateField === "string" ? config.dateField : "";
    const name: string = OWN_DATES.find((entry) => entry.value === field)?.label ?? (field ? field.replace(/^properties\./, "") : "a date…");
    const offset: number = typeof config.offsetDays === "number" ? config.offsetDays : 0;
    const days = (count: number): string => `${count} day${count === 1 ? "" : "s"}`;
    const when: string = offset === 0 ? `On ${name}` : offset < 0 ? `${days(-offset)} before ${name}` : `${days(offset)} after ${name}`;
    return `${when}, ${config.repeat === "once" ? "once" : "every year"}, from ${hourLabel(typeof config.hour === "number" ? config.hour : 9)}`;
}

/** A step in a sentence, for its box on the flow. */
export function describeStep(node: AutomationNode, data: AutomationData): string {
    const config = node.config;
    const name = (records: { uid: string; name: string }[], uid: unknown, fallback: string) => records.find((record) => record.uid === uid)?.name ?? fallback;
    switch (node.type) {
        case "trigger":
            if (config.event === "date.reached") {
                return describeDateTrigger(config);
            }
            return `When a contact ${(TRIGGER_EVENTS.find((entry) => entry.value === config.event)?.label ?? "…").toLowerCase()}${config.event === "custom" && config.name ? ` named "${config.name}"` : ""}`;
        case "delay":
            return `Wait ${config.amount ?? "?"} ${config.unit ?? ""}`;
        case "wait":
            return `Wait up to ${config.timeoutAmount ?? "?"} ${config.timeoutUnit ?? ""} for ${String(config.event ?? "").replace("email.", "")} of ${config.sendNodeId ?? "?"}`;
        case "condition":
            return config.filter ? "If the contact matches the conditions" : "If … (set the conditions)";
        case "split":
            return `${config.percent ?? 50}% take path A, the rest path B`;
        case "send_email":
            return `Send "${name(data.templates, config.templateUid, "…")}"`;
        case "set_field":
            return `Set ${config.field} to ${config.value ?? "nothing"}`;
        case "add_tag":
            return `Add the tag "${config.tag ?? "…"}"`;
        case "remove_tag":
            return `Remove the tag "${config.tag ?? "…"}"`;
        case "subscribe":
            return `Subscribe to ${name(data.lists, config.listUid, "…")}`;
        case "unsubscribe":
            return `Unsubscribe from ${name(data.lists, config.listUid, "…")}`;
        case "create_task":
            return `Create the task "${config.title ?? "…"}"`;
        case "notify":
            return `Notify ${data.members.find((member) => member.userUid === config.userUid)?.displayName ?? "a member"}`;
        case "enroll":
            return `Put into "${name(data.automations, config.automationUid, "…")}"`;
        case "webhook": {
            const endpoint = data.webhooks.find((entry) => entry.uid === config.endpointUid);
            return `Post to ${endpoint ? endpoint.description || endpoint.url : "a webhook…"}`;
        }
        default:
            return "End";
    }
}

/** The "+" that adds a step (or a jump to one) on a way out of a step. */
function AddStep({ from, port, onAdd, onJump, jumpTargets }: { from: string; port: string; onAdd: (type: NodeType) => void; onJump: (to: string) => void; jumpTargets: AutomationNode[] }) {
    return (
        <div className="flex justify-center my-1">
            <select
                aria-label={`Add a step after ${from}${port === "next" ? "" : ` (${PORT_LABELS[port]})`}`}
                className="text-xs border border-dashed border-border rounded-full px-2 py-0.5 bg-surface text-text-muted"
                value=""
                onChange={(event) => {
                    const value: string = event.target.value;
                    if (value.startsWith("goto:")) {
                        onJump(value.slice(5));
                    } else if (value) {
                        onAdd(value as NodeType);
                    }
                }}
            >
                <option value="">+ Add step</option>
                {STEP_TYPES.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                        {group.types.map((entry) => (
                            <option key={entry.type} value={entry.type}>
                                {entry.label}
                            </option>
                        ))}
                    </optgroup>
                ))}
                {jumpTargets.length > 0 && (
                    <optgroup label="Go to a step">
                        {jumpTargets.map((node) => (
                            <option key={node.id} value={`goto:${node.id}`}>
                                Go to {node.id}
                            </option>
                        ))}
                    </optgroup>
                )}
            </select>
        </div>
    );
}

interface FlowProps {
    graph: AutomationGraph;
    data: AutomationData;
    report: AutomationReport | null;
    selected: string | null;
    readOnly: boolean;
    onSelect: (id: string) => void;
    onChange: (graph: AutomationGraph, select?: string) => void;
}

/** A step's box, and what follows each of its ways out - branches side by side. */
function FlowBox({ step, props }: { step: FlowStep; props: FlowProps }) {
    const { graph, data, report, selected, readOnly, onSelect, onChange } = props;
    const { node } = step;
    const numbers = report?.nodes[node.id];
    return (
        <div className="flex flex-col items-center">
            <button
                type="button"
                aria-label={`Step ${node.id}`}
                aria-pressed={selected === node.id}
                onClick={() => onSelect(node.id)}
                className={`w-64 text-left rounded-sm border p-2 bg-surface ${selected === node.id ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary"}`}
            >
                <div className="text-xs uppercase tracking-wide text-text-muted">{stepLabel(node.type)}</div>
                <div className="text-sm">{describeStep(node, data)}</div>
                {numbers && (numbers.current > 0 || numbers.sent !== undefined) && (
                    <div className="text-xs text-primary-dark mt-1">
                        {numbers.current > 0 && `${numbers.current} here now`}
                        {numbers.sent !== undefined && `${numbers.current > 0 ? " · " : ""}${numbers.sent} sent · ${numbers.opened} opened · ${numbers.clicked} clicked · ${numbers.replied} replied`}
                    </div>
                )}
            </button>
            {step.outs.length > 0 && (
                <div className="flex gap-6 items-start">
                    {step.outs.map((out) => (
                        <div key={out.port} className="flex flex-col items-center">
                            <div className="w-px h-3 bg-border" />
                            {PORT_LABELS[out.port] && <div className="text-xs font-semibold text-text-muted">{PORT_LABELS[out.port]}</div>}
                            {!readOnly && (
                                <AddStep
                                    from={node.id}
                                    port={out.port}
                                    jumpTargets={graph.nodes.filter((entry) => entry.type !== "trigger" && entry.id !== node.id)}
                                    onAdd={(type) => {
                                        const added = insertStep(graph, node.id, out.port, type);
                                        onChange(added.graph, added.id);
                                    }}
                                    onJump={(to) => onChange(connect(graph, node.id, out.port, to))}
                                />
                            )}
                            {out.next && <FlowBox step={out.next} props={props} />}
                            {out.goto && (
                                <button type="button" className="text-xs text-primary-dark hover:underline" onClick={() => onSelect(out.goto!)}>
                                    ↪ Go to {out.goto}
                                </button>
                            )}
                            {!out.next && !out.goto && <div className="text-xs text-text-muted">End</div>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * One automation: its flow - the trigger and the steps after it, branches side by side, each step's settings beside - with its
 * live numbers once published, the settings of the whole automation (re-entry, goal), and the contacts in it. The flow is a draft
 * until published; contacts already in go on through the version they entered.
 */
export default function AutomationEditor({ uid }: { uid: string }) {
    const { workspace, canWrite, href } = useCrm();
    const data: AutomationData = useAutomationData();
    const fields = useSegmentFields(true);
    const [automation, setAutomation] = useState<Automation | null>(null);
    const [graph, setGraph] = useState<AutomationGraph | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);
    const [report, setReport] = useState<AutomationReport | null>(null);
    const [tab, setTab] = useState<"flow" | "settings" | "contacts">("flow");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [goalDraft, setGoalDraft] = useState(() => draftOf(undefined));

    async function loadReport(current: Automation): Promise<void> {
        if (!current.publishedVersionUid) {
            return;
        }
        try {
            setReport(await automationReport(workspace.uid, current.uid));
        } catch {
            setReport(null);
        }
    }

    useEffect(() => {
        getAutomation(workspace.uid, uid).then(
            (loaded) => {
                setAutomation(loaded);
                setGraph(loaded.graph);
                setGoalDraft(draftOf(loaded.goalFilter));
                void loadReport(loaded);
            },
            (err) => setError(errorMessage(err, "Could not load the automation.")),
        );
    }, [workspace.uid, uid]);

    if (!automation || !graph) {
        return error ? <Alert>{error}</Alert> : <p className="text-sm text-text-muted">Loading&hellip;</p>;
    }
    const readOnly: boolean = !canWrite;
    const flow: FlowStep | undefined = layout(graph);
    const selectedNode: AutomationNode | undefined = graph.nodes.find((node) => node.id === selected);

    function change(next: AutomationGraph, select?: string): void {
        setGraph(next);
        setDirty(true);
        setNotice(null);
        if (select) {
            setSelected(select);
        } else if (selected && !next.nodes.some((node) => node.id === selected)) {
            setSelected(null);
        }
    }

    async function act(action: () => Promise<void>): Promise<void> {
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            await action();
        } catch (err) {
            setError(errorMessage(err, "Something went wrong."));
        }
        setBusy(false);
    }

    const save = async (changes: Partial<Automation> = {}): Promise<Automation> => {
        const saved: Automation = await updateAutomation(workspace.uid, automation.uid, { graph: graph, version: automation.version, ...changes });
        setAutomation(saved);
        setDirty(false);
        return saved;
    };

    const publish = () =>
        act(async () => {
            if (dirty) {
                await save();
            }
            const published: Automation = await changeAutomation(workspace.uid, automation.uid, "publish");
            setAutomation(published);
            setNotice("Published. New contacts go through this version; those already in carry on with theirs.");
            await loadReport(published);
        });

    const pauseOrResume = () =>
        act(async () => {
            setAutomation(await changeAutomation(workspace.uid, automation.uid, automation.status === "active" ? "pause" : "resume"));
        });

    return (
        <div className="flex flex-col h-full -m-6">
            <header className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border">
                <a href={href("/crm/automations")} className="text-sm text-primary-dark hover:underline">
                    &larr; Automations
                </a>
                <input
                    aria-label="Automation name"
                    className={`${INPUT_CLASS} !w-64 font-semibold`}
                    value={automation.name}
                    readOnly={readOnly}
                    onChange={(event) => {
                        setAutomation({ ...automation, name: event.target.value });
                        setDirty(true);
                    }}
                />
                <span className="text-xs rounded-full px-2 py-0.5 bg-surface-alt">{STATUS_LABELS[automation.status]}</span>
                <div role="tablist" className="flex ml-4 text-sm">
                    {(["flow", "settings", "contacts"] as const).map((entry) => (
                        <button
                            key={entry}
                            type="button"
                            role="tab"
                            aria-selected={tab === entry}
                            onClick={() => setTab(entry)}
                            className={`px-3 py-1 capitalize ${tab === entry ? "border-b-2 border-primary font-semibold" : "text-text-muted"}`}
                        >
                            {entry === "contacts" ? "Contacts in it" : entry}
                        </button>
                    ))}
                </div>
                {!readOnly && (
                    <div className="flex gap-2 ml-auto">
                        {automation.status !== "draft" && (
                            <Button type="button" variant="secondary" className="!w-auto !py-1.5" disabled={busy} onClick={() => void pauseOrResume()}>
                                {automation.status === "active" ? "Pause" : "Resume"}
                            </Button>
                        )}
                        <Button type="button" variant="secondary" className="!w-auto !py-1.5" disabled={busy || !dirty} onClick={() => void act(async () => void (await save({ name: automation.name })))}>
                            {dirty ? "Save draft" : "Saved"}
                        </Button>
                        <Button type="button" className="!w-auto !py-1.5" loading={busy} disabled={busy} onClick={() => void publish()}>
                            Publish
                        </Button>
                    </div>
                )}
            </header>
            {(error || notice) && <div className="px-4 pt-2">{error ? <Alert>{error}</Alert> : <p role="status" className="text-sm text-success">{notice}</p>}</div>}
            {tab === "flow" && (
                <div className="flex flex-1 min-h-0">
                    <div className="flex-1 min-w-0 overflow-auto p-6">
                        {report && (
                            <p className="text-sm text-text-muted mb-4">
                                {report.states.active + report.states.waiting} in it now · {report.states.completed} finished · {report.states.exited} taken out · {report.states.failed} failed
                            </p>
                        )}
                        {flow && (
                            <FlowBox
                                step={flow}
                                props={{ graph, data, report, selected, readOnly, onSelect: setSelected, onChange: change }}
                            />
                        )}
                    </div>
                    <aside aria-label="Step settings" className="w-80 shrink-0 border-l border-border p-3 overflow-y-auto">
                        {selectedNode ? (
                            <fieldset disabled={readOnly}>
                                <StepInspector
                                    key={selectedNode.id}
                                    node={selectedNode}
                                    graph={graph}
                                    automationUid={automation.uid}
                                    data={data}
                                    onChange={(patch) => change(configure(graph, selectedNode.id, patch))}
                                />
                                {selectedNode.type !== "trigger" && (
                                    <button type="button" className="text-sm text-danger hover:underline" onClick={() => change(removeStep(graph, selectedNode.id))}>
                                        Remove this step
                                    </button>
                                )}
                            </fieldset>
                        ) : (
                            <p className="text-sm text-text-muted">Select a step to change it, or add one with a &ldquo;+ Add step&rdquo; menu.</p>
                        )}
                    </aside>
                </div>
            )}
            {tab === "settings" && (
                <fieldset disabled={readOnly} className="p-6 max-w-2xl">
                    <label className="block text-xs font-semibold text-text-muted mb-1" htmlFor="crm-automation-description">
                        Description
                    </label>
                    <input
                        id="crm-automation-description"
                        className={`${INPUT_CLASS} mb-4`}
                        value={automation.description ?? ""}
                        onChange={(event) => {
                            setAutomation({ ...automation, description: event.target.value });
                            setDirty(true);
                        }}
                    />
                    <fieldset className="mb-4 text-sm">
                        <legend className="text-xs font-semibold text-text-muted mb-1">A contact may go through it</legend>
                        {(
                            [
                                ["never", "Once only"],
                                ["after_exit", "Again, once they've finished"],
                            ] as const
                        ).map(([value, label]) => (
                            <label key={value} className="flex items-center gap-1.5">
                                <input
                                    type="radio"
                                    name="crm-automation-reentry"
                                    checked={automation.reentry === value}
                                    onChange={() => {
                                        setAutomation({ ...automation, reentry: value });
                                        setDirty(true);
                                    }}
                                />
                                {label}
                            </label>
                        ))}
                    </fieldset>
                    <div className="text-xs font-semibold text-text-muted mb-1">Goal: contacts matching this leave the automation</div>
                    <FilterBuilder
                        fields={fields}
                        draft={goalDraft}
                        onChange={(next) => {
                            setGoalDraft(next);
                            setAutomation({ ...automation, goalFilter: buildFilter(next, fields) ?? null });
                            setDirty(true);
                        }}
                    />
                    {!readOnly && (
                        <Button
                            type="button"
                            variant="secondary"
                            className="!w-auto mt-4"
                            disabled={busy || !dirty}
                            onClick={() =>
                                void act(async () => {
                                    await save({ name: automation.name, description: automation.description || null, reentry: automation.reentry, goalFilter: automation.goalFilter ?? null });
                                    setNotice("Saved.");
                                })
                            }
                        >
                            Save settings
                        </Button>
                    )}
                </fieldset>
            )}
            {tab === "contacts" && <Enrollments automation={automation} readOnly={readOnly} />}
        </div>
    );
}

const STATES: EnrollmentState[] = ["active", "waiting", "completed", "exited", "failed"];

/** The contacts that went through an automation, filterable by where they are, with a way to take one out. */
function Enrollments({ automation, readOnly }: { automation: Automation; readOnly: boolean }) {
    const { workspace, href } = useCrm();
    const [state, setState] = useState<EnrollmentState | "">("");
    const [page, setPage] = useState(0);
    const [result, setResult] = useState<{ items: Enrollment[]; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        listEnrollments(workspace.uid, automation.uid, { state: state || undefined, page, limit: 50 }).then(setResult, (err) => setError(errorMessage(err, "Could not load the contacts.")));
    }, [state, page, reload]);

    async function exit(enrollment: Enrollment): Promise<void> {
        try {
            await exitEnrollment(workspace.uid, automation.uid, enrollment.uid);
            setReload(reload + 1);
        } catch (err) {
            setError(errorMessage(err, "Could not take the contact out."));
        }
    }

    return (
        <div className="p-6 max-w-5xl">
            <select aria-label="Where" className={`${INPUT_CLASS} !w-48 mb-3`} value={state} onChange={(event) => { setState(event.target.value as EnrollmentState | ""); setPage(0); }}>
                <option value="">Everyone</option>
                {STATES.map((entry) => (
                    <option key={entry} value={entry}>
                        {entry}
                    </option>
                ))}
            </select>
            {error && <Alert>{error}</Alert>}
            {result && result.items.length === 0 && <p className="text-sm text-text-muted">Nobody yet.</p>}
            {result && result.items.length > 0 && (
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr>
                            {["Contact", "Where", "At step", "Entered", ""].map((heading) => (
                                <th key={heading} className="text-left text-xs uppercase tracking-wide text-text-muted py-2 px-2.5 border-b border-border">
                                    {heading}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {result.items.map((enrollment) => (
                            <tr key={enrollment.uid}>
                                <td className="py-2 px-2.5 border-b border-border">
                                    <a className="text-primary-dark hover:underline" href={href(`/crm/contacts/${encodeURIComponent(enrollment.contactUid)}`)}>
                                        {enrollment.email ?? enrollment.contactUid}
                                    </a>
                                </td>
                                <td className="py-2 px-2.5 border-b border-border">
                                    {enrollment.state}
                                    {enrollment.error && <div className="text-xs text-danger">{enrollment.error}</div>}
                                </td>
                                <td className="py-2 px-2.5 border-b border-border">{enrollment.currentNodeId}</td>
                                <td className="py-2 px-2.5 border-b border-border whitespace-nowrap">{new Date(enrollment.enteredAt).toLocaleString()}</td>
                                <td className="py-2 px-2.5 border-b border-border text-right">
                                    {!readOnly && (enrollment.state === "active" || enrollment.state === "waiting") && (
                                        <button type="button" className="text-danger hover:underline" onClick={() => void exit(enrollment)}>
                                            Take out
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {result && result.total > (page + 1) * 50 && (
                <Button type="button" variant="secondary" className="!w-auto mt-3" onClick={() => setPage(page + 1)}>
                    Next page
                </Button>
            )}
            {page > 0 && (
                <Button type="button" variant="secondary" className="!w-auto mt-3 ml-2" onClick={() => setPage(page - 1)}>
                    Previous page
                </Button>
            )}
        </div>
    );
}
