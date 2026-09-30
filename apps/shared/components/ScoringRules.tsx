///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import Modal from "@rapidmx/web-client/lib/components/overlays/Modal.js";
import {
    FilterNode,
    ScoringActivity,
    ScoringKind,
    ScoringRule,
    ScoringRuleInput,
    createScoringRule,
    deleteScoringRule,
    errorMessage,
    listScoringRules,
    recalculateScores,
    updateScoringRule,
} from "../crmApi.js";
import { FieldInfo } from "../fields.js";
import { INPUT_CLASS, useCrm } from "./CrmShell.js";
import FilterBuilder, { FilterDraft, buildFilter, draftOf } from "./FilterBuilder.js";
import { useSegmentFields } from "./SegmentManager.js";

export const ACTIVITIES: { value: ScoringActivity; label: string }[] = [
    { value: "opened", label: "Opened an email" },
    { value: "clicked", label: "Clicked a link in an email" },
    { value: "replied", label: "Replied to an email" },
    { value: "form_submitted", label: "Submitted a form" },
    { value: "subscribed", label: "Subscribed to a list" },
    { value: "unsubscribed", label: "Unsubscribed from a list" },
    { value: "bounced", label: "Had an email bounce" },
];

/** A rule in a sentence: "+10 each time: Opened an email (last 30 days, at most 50)". */
export function describeRule(rule: ScoringRule): string {
    const points: string = `${rule.points > 0 ? "+" : ""}${rule.points}`;
    if (rule.kind === "property") {
        return `${points} when the contact matches the rule's conditions`;
    }
    const activity: string = ACTIVITIES.find((entry) => entry.value === rule.activity)?.label ?? String(rule.activity);
    const limits: string[] = [...(rule.withinDays ? [`last ${rule.withinDays} days`] : []), ...(rule.maxPoints ? [`at most ${rule.maxPoints}`] : [])];
    return `${points} each time: ${activity}${limits.length > 0 ? ` (${limits.join(", ")})` : ""}`;
}

/**
 * A workspace's lead scoring rules: a contact's score is the sum of the enabled rules' points. Admins add, change, switch off and
 * delete rules and can rescore everyone at once; scores are otherwise brought up to date in the background.
 */
export default function ScoringRules() {
    const { workspace, canManage } = useCrm();
    const [rules, setRules] = useState<ScoringRule[]>([]);
    const [editing, setEditing] = useState<ScoringRule | "new" | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function load(): Promise<void> {
        try {
            setRules(await listScoringRules(workspace.uid));
        } catch (err) {
            setError(errorMessage(err, "Could not load the scoring rules."));
        }
    }

    useEffect(() => {
        void load();
    }, [workspace.uid]);

    async function toggle(rule: ScoringRule): Promise<void> {
        try {
            await updateScoringRule(workspace.uid, rule.uid, { enabled: !rule.enabled });
            await load();
        } catch (err) {
            setError(errorMessage(err, "Could not change the rule."));
        }
    }

    async function remove(rule: ScoringRule): Promise<void> {
        if (!window.confirm(`Delete the rule "${rule.name}"?`)) {
            return;
        }
        try {
            await deleteScoringRule(workspace.uid, rule.uid);
            await load();
        } catch (err) {
            setError(errorMessage(err, "Could not delete the rule."));
        }
    }

    async function recalculate(): Promise<void> {
        setBusy(true);
        setNotice(null);
        try {
            const { changed } = await recalculateScores(workspace.uid);
            setNotice(`Scores recalculated: ${changed} ${changed === 1 ? "contact" : "contacts"} changed.`);
        } catch (err) {
            setError(errorMessage(err, "Could not recalculate the scores."));
        }
        setBusy(false);
    }

    return (
        <div className="max-w-4xl">
            <div className="flex items-center justify-between gap-2 mb-2">
                <h1 className="text-lg font-bold tracking-tight">Lead scoring</h1>
                {canManage && (
                    <div className="flex gap-2">
                        <Button type="button" variant="secondary" className="!w-auto" loading={busy} disabled={busy} onClick={() => void recalculate()}>
                            Recalculate now
                        </Button>
                        <Button type="button" className="!w-auto" onClick={() => setEditing("new")}>
                            + New rule
                        </Button>
                    </div>
                )}
            </div>
            <p className="text-sm text-text-muted mb-4">
                A contact&apos;s score is the sum of the points of every rule below. Scores update in the background; filter and sort contacts by
                score to find your hottest leads.
            </p>
            {error && <Alert>{error}</Alert>}
            {notice && (
                <p role="status" className="text-sm text-success mb-3">
                    {notice}
                </p>
            )}
            {rules.length === 0 ? (
                <p className="text-sm text-text-muted">No scoring rules yet.</p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {rules.map((rule) => (
                        <li key={rule.uid} className={`flex items-center gap-3 border border-border rounded-sm p-3 ${rule.enabled ? "" : "opacity-60"}`}>
                            <div className="flex-1 min-w-0">
                                <div className="font-medium">{rule.name}</div>
                                <div className="text-sm text-text-muted">{describeRule(rule)}</div>
                            </div>
                            {canManage && (
                                <>
                                    <label className="flex items-center gap-1.5 text-sm">
                                        <input type="checkbox" checked={rule.enabled} onChange={() => void toggle(rule)} />
                                        On
                                    </label>
                                    <button type="button" className="text-sm text-primary-dark hover:underline font-medium" onClick={() => setEditing(rule)}>
                                        Edit
                                    </button>
                                    <button type="button" className="text-sm text-danger hover:underline" onClick={() => void remove(rule)}>
                                        Delete
                                    </button>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {editing && (
                <RuleEditor
                    rule={editing === "new" ? undefined : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        void load();
                    }}
                />
            )}
        </div>
    );
}

/** Creates or changes a scoring rule. A rule's kind is chosen when it is created. */
function RuleEditor({ rule, onClose, onSaved }: { rule?: ScoringRule; onClose: () => void; onSaved: () => void }) {
    const { workspace } = useCrm();
    const fields: FieldInfo[] = useSegmentFields();
    const [name, setName] = useState(rule?.name ?? "");
    const [kind, setKind] = useState<ScoringKind>(rule?.kind ?? "property");
    const [draft, setDraft] = useState<FilterDraft>(() => draftOf(rule?.filter));
    const [activity, setActivity] = useState<ScoringActivity>(rule?.activity ?? "opened");
    const [points, setPoints] = useState(String(rule?.points ?? 10));
    const [maxPoints, setMaxPoints] = useState(rule?.maxPoints ? String(rule.maxPoints) : "");
    const [withinDays, setWithinDays] = useState(rule?.withinDays ? String(rule.withinDays) : "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const filter: FilterNode | undefined = buildFilter(draft, fields);

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setSaving(true);
        const input: ScoringRuleInput = {
            name: name.trim(),
            points: Number(points),
            ...(kind === "property"
                ? { filter }
                : { activity, maxPoints: maxPoints ? Number(maxPoints) : null, withinDays: withinDays ? Number(withinDays) : null }),
        };
        try {
            await (rule ? updateScoringRule(workspace.uid, rule.uid, input) : createScoringRule(workspace.uid, { ...input, kind }));
            onSaved();
        } catch (err) {
            setError(errorMessage(err, "Could not save the rule."));
            setSaving(false);
        }
    }

    return (
        <Modal open onClose={onClose} title={rule ? "Edit rule" : "New rule"}>
            <form onSubmit={submit} className="flex flex-col gap-3 min-w-[34rem]">
                {error && <Alert>{error}</Alert>}
                <FormField label="Name" htmlFor="crm-rule-name">
                    <input id="crm-rule-name" className={INPUT_CLASS} value={name} onChange={(event) => setName(event.target.value)} required />
                </FormField>
                {!rule && (
                    <fieldset className="flex gap-4 text-sm">
                        <legend className="text-xs font-semibold text-text-muted mb-1">Score contacts</legend>
                        <label className="flex items-center gap-1.5">
                            <input type="radio" name="crm-rule-kind" checked={kind === "property"} onChange={() => setKind("property")} />
                            By who they are
                        </label>
                        <label className="flex items-center gap-1.5">
                            <input type="radio" name="crm-rule-kind" checked={kind === "activity"} onChange={() => setKind("activity")} />
                            By what they do
                        </label>
                    </fieldset>
                )}
                {kind === "property" ? (
                    <div>
                        <div className="text-xs font-semibold text-text-muted mb-1">Contacts matching</div>
                        <FilterBuilder fields={fields} draft={draft} onChange={setDraft} />
                    </div>
                ) : (
                    <>
                        <FormField label="Each time the contact" htmlFor="crm-rule-activity">
                            <select id="crm-rule-activity" className={INPUT_CLASS} value={activity} onChange={(event) => setActivity(event.target.value as ScoringActivity)}>
                                {ACTIVITIES.map((entry) => (
                                    <option key={entry.value} value={entry.value}>
                                        {entry.label}
                                    </option>
                                ))}
                            </select>
                        </FormField>
                        <div className="flex gap-3">
                            <FormField label="In the last (days, empty: ever)" htmlFor="crm-rule-days">
                                <input id="crm-rule-days" type="number" min={1} className={INPUT_CLASS} value={withinDays} onChange={(event) => setWithinDays(event.target.value)} />
                            </FormField>
                            <FormField label="At most (points, empty: no limit)" htmlFor="crm-rule-max">
                                <input id="crm-rule-max" type="number" min={1} className={INPUT_CLASS} value={maxPoints} onChange={(event) => setMaxPoints(event.target.value)} />
                            </FormField>
                        </div>
                    </>
                )}
                <FormField label="Points (negative takes away)" htmlFor="crm-rule-points">
                    <input id="crm-rule-points" type="number" min={-100} max={100} className={`${INPUT_CLASS} !w-32`} value={points} onChange={(event) => setPoints(event.target.value)} required />
                </FormField>
                <Button type="submit" loading={saving} disabled={saving || !name.trim() || (kind === "property" && !filter)} className="!w-auto self-start">
                    {rule ? "Save" : "Create"}
                </Button>
            </form>
        </Modal>
    );
}
