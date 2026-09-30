///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { ReactNode, useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import {
    AbMetric,
    AbTest,
    Campaign,
    CampaignProblem,
    EmailTemplate,
    MailingList,
    WorkspaceSender,
    campaignAudience,
    campaignChecklist,
    changeCampaign,
    errorMessage,
    getTemplate,
    listLists,
    listSenders,
    scheduleCampaign,
    searchTemplates,
    updateCampaign,
} from "../../crmApi.js";
import { INPUT_CLASS, useCrm } from "../CrmShell.js";
import PreviewModal from "../designer/PreviewModal.js";
import TestSendModal from "../designer/TestSendModal.js";
import { StatusBadge, when } from "./campaignUi.js";

/** What the editor changes. */
interface Draft {
    name: string;
    senderUid: string;
    templateUid: string;
    listUids: string[];
    excludeListUids: string[];
    trackOpens: boolean;
    trackClicks: boolean;
    abTest: AbTest | null;
}

function draftOf(campaign: Campaign): Draft {
    return {
        name: campaign.name,
        senderUid: campaign.senderUid ?? "",
        templateUid: campaign.templateUid ?? "",
        listUids: campaign.listUids,
        excludeListUids: campaign.excludeListUids,
        trackOpens: campaign.trackOpens,
        trackClicks: campaign.trackClicks,
        abTest: campaign.abTest ?? null,
    };
}

const VARIANT_IDS = ["A", "B", "C", "D"];
const METRICS: { value: AbMetric; label: string }[] = [
    { value: "open", label: "Opens" },
    { value: "click", label: "Clicks" },
    { value: "reply", label: "Replies" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="border border-border rounded-sm p-4 mb-4">
            <h2 className="text-sm font-semibold mb-3">{title}</h2>
            {children}
        </section>
    );
}

/** Checkboxes for a set of lists. */
function ListPicker({ label, lists, chosen, onChange }: { label: string; lists: MailingList[]; chosen: string[]; onChange: (uids: string[]) => void }) {
    return (
        <fieldset className="mb-3">
            <legend className="text-xs font-semibold text-text-muted mb-1">{label}</legend>
            {lists.length === 0 ? (
                <p className="text-sm text-text-muted">The workspace has no lists yet.</p>
            ) : (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {lists.map((list) => (
                        <label key={list.uid} className="flex items-center gap-1.5 text-sm">
                            <input
                                type="checkbox"
                                checked={chosen.includes(list.uid)}
                                onChange={(event) => onChange(event.target.checked ? [...chosen, list.uid] : chosen.filter((uid) => uid !== list.uid))}
                            />
                            {list.name}
                        </label>
                    ))}
                </div>
            )}
        </fieldset>
    );
}

/**
 * A draft campaign: who it's from, who it goes to (with how many that reaches now), which email, tracking, an optional A/B test, and
 * what still stands in the way of sending. Saving keeps it a draft; "Send" saves and schedules it, now or at a chosen time. A
 * scheduled campaign shows when it goes, and can go back to being a draft.
 */
export default function CampaignEditor({ campaign, onChanged }: { campaign: Campaign; onChanged: (campaign: Campaign) => void }) {
    const { workspace, canWrite, href } = useCrm();
    const [draft, setDraft] = useState<Draft>(() => draftOf(campaign));
    const [dirty, setDirty] = useState(false);
    const [lists, setLists] = useState<MailingList[]>([]);
    const [senders, setSenders] = useState<WorkspaceSender[]>([]);
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [audience, setAudience] = useState<{ count: number; capped: boolean } | null>(null);
    const [problems, setProblems] = useState<CampaignProblem[] | null>(null);
    const [sendAt, setSendAt] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<EmailTemplate | null>(null);
    const [testing, setTesting] = useState(false);
    const editable: boolean = canWrite && campaign.status === "draft";

    useEffect(() => {
        listLists(workspace.uid).then(setLists, () => setLists([]));
        listSenders(workspace.uid).then(setSenders, () => setSenders([]));
        searchTemplates(workspace.uid, 0, 200).then(
            (result) => setTemplates(result.items),
            () => setTemplates([]),
        );
    }, [workspace.uid]);

    useEffect(() => {
        campaignChecklist(workspace.uid, campaign.uid).then(setProblems, () => setProblems(null));
    }, [campaign.uid, campaign.version]);

    useEffect(() => {
        if (draft.listUids.length === 0) {
            setAudience({ count: 0, capped: false });
            return;
        }
        let current = true;
        campaignAudience(workspace.uid, { listUids: draft.listUids, excludeListUids: draft.excludeListUids }).then(
            (result) => current && setAudience(result),
            () => current && setAudience(null),
        );
        return () => {
            current = false;
        };
    }, [draft.listUids.join(","), draft.excludeListUids.join(",")]);

    function change(patch: Partial<Draft>): void {
        setDraft({ ...draft, ...patch });
        setDirty(true);
    }

    function changeTest(patch: Partial<AbTest>): void {
        change({ abTest: { ...draft.abTest!, ...patch } });
    }

    /** Saves the draft if it changed. Returns the campaign as saved, or `undefined` after an error. */
    async function save(): Promise<Campaign | undefined> {
        if (!dirty) {
            return campaign;
        }
        try {
            const saved: Campaign = await updateCampaign(workspace.uid, campaign.uid, {
                name: draft.name,
                senderUid: draft.senderUid || null,
                templateUid: draft.templateUid || null,
                listUids: draft.listUids,
                excludeListUids: draft.excludeListUids,
                trackOpens: draft.trackOpens,
                trackClicks: draft.trackClicks,
                abTest: draft.abTest,
                version: campaign.version,
            });
            setDirty(false);
            onChanged(saved);
            return saved;
        } catch (err) {
            setError(errorMessage(err, "Could not save the campaign."));
            return undefined;
        }
    }

    async function run(action: () => Promise<void>): Promise<void> {
        setBusy(true);
        setError(null);
        await action();
        setBusy(false);
    }

    const send = () =>
        run(async () => {
            const saved: Campaign | undefined = await save();
            if (!saved) {
                return;
            }
            if (!window.confirm(sendAt ? `Send "${saved.name}" on ${new Date(sendAt).toLocaleString()}?` : `Send "${saved.name}" now?`)) {
                return;
            }
            try {
                onChanged(await scheduleCampaign(workspace.uid, saved.uid, sendAt ? new Date(sendAt).toISOString() : undefined));
            } catch (err) {
                setError(errorMessage(err, "Could not schedule the campaign."));
            }
        });

    const unschedule = () =>
        run(async () => {
            try {
                onChanged(await changeCampaign(workspace.uid, campaign.uid, "unschedule"));
            } catch (err) {
                setError(errorMessage(err, "Could not take the campaign back."));
            }
        });

    async function openPreview(templateUid: string): Promise<void> {
        try {
            setPreview(await getTemplate(workspace.uid, templateUid));
        } catch (err) {
            setError(errorMessage(err, "Could not load the template."));
        }
    }

    const templateSelect = (value: string, onChange: (uid: string) => void, label: string, empty: string) => (
        <select aria-label={label} className={INPUT_CLASS} value={value} disabled={!editable} onChange={(event) => onChange(event.target.value)}>
            <option value="">{empty}</option>
            {templates.map((template) => (
                <option key={template.uid} value={template.uid}>
                    {template.name}
                </option>
            ))}
        </select>
    );

    return (
        <div className="max-w-4xl">
            <a href={href("/crm/campaigns")} className="text-sm text-primary-dark hover:underline">
                &larr; Campaigns
            </a>
            <div className="flex flex-wrap items-center gap-3 mt-2 mb-4">
                <input
                    aria-label="Campaign name"
                    className={`${INPUT_CLASS} !w-80 text-lg font-semibold`}
                    value={draft.name}
                    readOnly={!editable}
                    onChange={(event) => change({ name: event.target.value })}
                />
                <StatusBadge status={campaign.status} />
            </div>
            {error && <Alert>{error}</Alert>}
            {campaign.status === "scheduled" && (
                <div className="flex items-center gap-3 mb-4 rounded-sm bg-primary-lightest p-3 text-sm">
                    <span>Goes out {when(campaign.scheduledAt)}.</span>
                    {canWrite && (
                        <Button type="button" variant="secondary" className="!w-auto !py-1" disabled={busy} onClick={() => void unschedule()}>
                            Back to draft
                        </Button>
                    )}
                </div>
            )}
            <fieldset disabled={!editable}>
                <Section title="From">
                    <select aria-label="Sender" className={INPUT_CLASS} value={draft.senderUid} onChange={(event) => change({ senderUid: event.target.value })}>
                        <option value="">Choose who it&apos;s from&hellip;</option>
                        {senders.map((sender) => (
                            <option key={sender.uid} value={sender.uid}>
                                {sender.fromName ? `${sender.fromName} <${sender.fromAddress}>` : sender.fromAddress}
                            </option>
                        ))}
                    </select>
                </Section>
                <Section title="To">
                    <ListPicker label="Send to the subscribers of" lists={lists} chosen={draft.listUids} onChange={(listUids) => change({ listUids })} />
                    <ListPicker
                        label="But not to the subscribers of"
                        lists={lists.filter((list) => !draft.listUids.includes(list.uid))}
                        chosen={draft.excludeListUids}
                        onChange={(excludeListUids) => change({ excludeListUids })}
                    />
                    <p role="status" className="text-sm text-text-muted">
                        {audience
                            ? `Reaches ${audience.capped ? "more than " : ""}${audience.count.toLocaleString()} ${audience.count === 1 ? "contact" : "contacts"} right now.`
                            : "Couldn't count who this reaches."}
                    </p>
                </Section>
                <Section title="Email">
                    <div className="flex gap-2 items-center">
                        {templateSelect(draft.templateUid, (templateUid) => change({ templateUid }), "Template", "Choose the email to send…")}
                        {draft.templateUid && (
                            <>
                                <Button type="button" variant="text" className="!w-auto whitespace-nowrap" onClick={() => void openPreview(draft.templateUid)}>
                                    Preview
                                </Button>
                                <a className="text-sm text-primary-dark hover:underline whitespace-nowrap" href={href(`/crm/templates/${encodeURIComponent(draft.templateUid)}`)}>
                                    Edit
                                </a>
                                {canWrite && (
                                    <Button type="button" variant="text" className="!w-auto whitespace-nowrap" onClick={() => setTesting(true)}>
                                        Send test
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </Section>
                <Section title="Tracking">
                    <label className="flex items-center gap-1.5 text-sm mb-1">
                        <input type="checkbox" checked={draft.trackOpens} onChange={(event) => change({ trackOpens: event.target.checked })} />
                        Track opens (an invisible image)
                    </label>
                    <label className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={draft.trackClicks} onChange={(event) => change({ trackClicks: event.target.checked })} />
                        Track clicks (links go through a redirect)
                    </label>
                </Section>
                <Section title="A/B test">
                    <label className="flex items-center gap-1.5 text-sm mb-3">
                        <input
                            type="checkbox"
                            checked={draft.abTest !== null}
                            onChange={(event) => change({ abTest: event.target.checked ? { variants: [{ id: "A" }, { id: "B" }], testPercent: 20, metric: "open", testHours: 4 } : null })}
                        />
                        Test versions on part of the audience, then send the best to the rest
                    </label>
                    {draft.abTest && (
                        <>
                            {draft.abTest.variants.map((variant, index) => (
                                <div key={variant.id} className="flex items-center gap-2 mb-2">
                                    <span className="w-6 font-semibold text-sm">{variant.id}</span>
                                    <input
                                        aria-label={`Subject of variant ${variant.id}`}
                                        placeholder="The template's subject"
                                        className={INPUT_CLASS}
                                        value={variant.subject ?? ""}
                                        onChange={(event) =>
                                            changeTest({ variants: draft.abTest!.variants.map((entry, at) => (at === index ? { ...entry, subject: event.target.value || undefined } : entry)) })
                                        }
                                    />
                                    {templateSelect(
                                        variant.templateUid ?? "",
                                        (templateUid) =>
                                            changeTest({ variants: draft.abTest!.variants.map((entry, at) => (at === index ? { ...entry, templateUid: templateUid || undefined } : entry)) }),
                                        `Template of variant ${variant.id}`,
                                        "The campaign's email",
                                    )}
                                    {draft.abTest!.variants.length > 2 && (
                                        <button
                                            type="button"
                                            aria-label={`Remove variant ${variant.id}`}
                                            className="px-2 text-danger"
                                            onClick={() => changeTest({ variants: draft.abTest!.variants.filter((_entry, at) => at !== index).map((entry, at) => ({ ...entry, id: VARIANT_IDS[at] })) })}
                                        >
                                            &times;
                                        </button>
                                    )}
                                </div>
                            ))}
                            {draft.abTest.variants.length < VARIANT_IDS.length && (
                                <button
                                    type="button"
                                    className="text-sm text-primary-dark hover:underline mb-3"
                                    onClick={() => changeTest({ variants: [...draft.abTest!.variants, { id: VARIANT_IDS[draft.abTest!.variants.length] }] })}
                                >
                                    + Add variant
                                </button>
                            )}
                            <div className="flex flex-wrap gap-4 items-end text-sm">
                                <label className="flex flex-col gap-1">
                                    Test on (% of the audience)
                                    <input
                                        type="number"
                                        min={5}
                                        max={50}
                                        className={`${INPUT_CLASS} !w-24`}
                                        value={draft.abTest.testPercent}
                                        onChange={(event) => changeTest({ testPercent: Number(event.target.value) })}
                                    />
                                </label>
                                <label className="flex flex-col gap-1">
                                    Pick the winner by
                                    <select className={`${INPUT_CLASS} !w-32`} value={draft.abTest.metric} onChange={(event) => changeTest({ metric: event.target.value as AbMetric })}>
                                        {METRICS.map((metric) => (
                                            <option key={metric.value} value={metric.value}>
                                                {metric.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-1">
                                    After (hours)
                                    <input
                                        type="number"
                                        min={1}
                                        max={168}
                                        className={`${INPUT_CLASS} !w-24`}
                                        value={draft.abTest.testHours}
                                        onChange={(event) => changeTest({ testHours: Number(event.target.value) })}
                                    />
                                </label>
                            </div>
                        </>
                    )}
                </Section>
            </fieldset>
            {editable && (
                <Section title="Send">
                    {problems && problems.length > 0 && (
                        <ul className="mb-3 text-sm list-disc pl-5 text-warning">
                            {problems.map((problem) => (
                                <li key={problem.message}>{problem.message}</li>
                            ))}
                        </ul>
                    )}
                    {problems && problems.length === 0 && !dirty && <p className="mb-3 text-sm text-success">Ready to send.</p>}
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="flex flex-col gap-1 text-sm">
                            When (empty: now)
                            <input type="datetime-local" className={`${INPUT_CLASS} !w-56`} value={sendAt} onChange={(event) => setSendAt(event.target.value)} />
                        </label>
                        <Button type="button" variant="secondary" className="!w-auto" disabled={busy || !dirty} onClick={() => void run(async () => void (await save()))}>
                            Save draft
                        </Button>
                        <Button type="button" className="!w-auto" loading={busy} disabled={busy} onClick={() => void send()}>
                            {sendAt ? "Schedule" : "Send now"}
                        </Button>
                    </div>
                </Section>
            )}
            {preview && (
                <PreviewModal
                    open
                    onClose={() => setPreview(null)}
                    workspaceUid={workspace.uid}
                    design={preview.design}
                    subject={preview.subject}
                    preheader={preview.preheader ?? ""}
                />
            )}
            <TestSendModal open={testing} onClose={() => setTesting(false)} workspaceUid={workspace.uid} templateUid={draft.templateUid} senders={senders} />
        </div>
    );
}
