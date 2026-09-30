///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import {
    Company,
    Contact,
    Deal,
    Note,
    Pipeline,
    Task,
    TimelineEvent,
    WorkspaceMember,
    deleteDeal,
    errorMessage,
    getDeal,
    getRecord,
    listMembers,
    listNotes,
    listPipelines,
    listTasks,
    listTimeline,
    searchRecords,
    updateDeal,
} from "../../crmApi.js";
import { INPUT_CLASS, useCrm } from "../CrmShell.js";
import { Activity, Notes, Tasks } from "../RecordDetail.js";
import { money } from "./dealUi.js";

/** What the deal form edits. */
interface DealForm {
    name: string;
    amount: string;
    currency: string;
    pipelineUid: string;
    stageId: string;
    ownerUserUid: string;
    expectedCloseDate: string;
    lostReason: string;
}

function formOf(deal: Deal): DealForm {
    return {
        name: deal.name,
        amount: String(deal.amount),
        currency: deal.currency,
        pipelineUid: deal.pipelineUid,
        stageId: deal.stageId,
        ownerUserUid: deal.ownerUserUid ?? "",
        expectedCloseDate: deal.expectedCloseDate ? deal.expectedCloseDate.slice(0, 10) : "",
        lostReason: deal.lostReason ?? "",
    };
}

/**
 * One deal: its details (moving it between stages and pipelines), the people and company it involves, how it moved through the
 * stages, and its notes, tasks and activity.
 */
export default function DealDetail({ uid }: { uid: string }) {
    const { workspace, canWrite, href } = useCrm();
    const [deal, setDeal] = useState<Deal | null>(null);
    const [form, setForm] = useState<DealForm | null>(null);
    const [pipelines, setPipelines] = useState<Pipeline[]>([]);
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [company, setCompany] = useState<Company | null>(null);
    const [notes, setNotes] = useState<Note[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    async function loadActivity(): Promise<void> {
        const [noteList, taskList, entries] = await Promise.all([listNotes(workspace.uid, uid), listTasks(workspace.uid, { subjectUid: uid }), listTimeline(workspace.uid, "deal", uid)]);
        setNotes(noteList);
        setTasks(taskList);
        setTimeline(entries);
    }

    async function show(loaded: Deal): Promise<void> {
        setDeal(loaded);
        setForm(formOf(loaded));
        const people: Contact[] = [];
        for (const contactUid of loaded.contactUids) {
            try {
                people.push(await getRecord<Contact>("contact", workspace.uid, contactUid));
            } catch {
                // Gone: left out.
            }
        }
        setContacts(people);
        setCompany(loaded.companyUid ? await getRecord<Company>("company", workspace.uid, loaded.companyUid).catch(() => null) : null);
    }

    useEffect(() => {
        void (async () => {
            try {
                const [loaded, pipelineList] = await Promise.all([getDeal(workspace.uid, uid), listPipelines(workspace.uid)]);
                setPipelines(pipelineList);
                await show(loaded);
                setMembers(await listMembers(workspace.uid).catch(() => []));
                await loadActivity();
            } catch (err) {
                setError(errorMessage(err, "Could not load the deal."));
            }
        })();
    }, [workspace.uid, uid]);

    if (!deal || !form) {
        return error ? <Alert>{error}</Alert> : <p className="text-sm text-text-muted">Loading&hellip;</p>;
    }
    const pipeline: Pipeline | undefined = pipelines.find((entry) => entry.uid === form.pipelineUid);
    const stageName = (stageId: string): string =>
        pipelines.flatMap((entry) => entry.stages).find((stage) => stage.id === stageId)?.name ?? "a stage no longer there";

    async function save(input: Parameters<typeof updateDeal>[2]): Promise<void> {
        setError(null);
        setSaved(false);
        try {
            await show(await updateDeal(workspace.uid, uid, { ...input, version: deal!.version }));
            setSaved(true);
            await loadActivity();
        } catch (err) {
            setError(errorMessage(err, "Could not save the deal."));
        }
    }

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        const current: DealForm = form!;
        const stage = pipeline?.stages.find((entry) => entry.id === current.stageId);
        await save({
            name: current.name.trim(),
            amount: Number(current.amount) || 0,
            currency: current.currency,
            pipelineUid: current.pipelineUid,
            stageId: current.stageId,
            ownerUserUid: current.ownerUserUid || null,
            expectedCloseDate: current.expectedCloseDate ? new Date(current.expectedCloseDate).toISOString() : null,
            ...(stage?.kind === "lost" ? { lostReason: current.lostReason.trim() || null } : {}),
        });
    }

    async function remove(): Promise<void> {
        if (!window.confirm(`Delete the deal "${deal!.name}"?`)) {
            return;
        }
        try {
            await deleteDeal(workspace.uid, uid);
            window.location.assign(href("/crm/deals"));
        } catch (err) {
            setError(errorMessage(err, "Could not delete the deal."));
        }
    }

    const set = (patch: Partial<DealForm>) => setForm({ ...form, ...patch });
    const selectedStage = pipeline?.stages.find((entry) => entry.id === form.stageId);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl">
            <div>
                <a href={href("/crm/deals")} className="text-sm text-primary-dark hover:underline">
                    &larr; Deals
                </a>
                <h1 className="text-lg font-bold tracking-tight mt-2">{deal.name}</h1>
                <p className="text-sm text-text-muted mb-4">
                    {money(deal.amount, deal.currency)} · {deal.status === "open" ? stageName(deal.stageId) : deal.status === "won" ? "Won" : "Lost"}
                    {deal.lostReason ? ` - ${deal.lostReason}` : ""}
                </p>
                {error && <Alert>{error}</Alert>}
                {saved && (
                    <p role="status" className="text-sm text-success mb-2">
                        Saved.
                    </p>
                )}
                <form onSubmit={submit}>
                    <fieldset disabled={!canWrite} className="flex flex-col gap-3">
                        <FormField label="Name" htmlFor="crm-deal-edit-name">
                            <input id="crm-deal-edit-name" className={INPUT_CLASS} value={form.name} onChange={(event) => set({ name: event.target.value })} required />
                        </FormField>
                        <div className="flex gap-2">
                            <FormField label="Amount" htmlFor="crm-deal-edit-amount">
                                <input id="crm-deal-edit-amount" type="number" min={0} className={INPUT_CLASS} value={form.amount} onChange={(event) => set({ amount: event.target.value })} />
                            </FormField>
                            <FormField label="Currency" htmlFor="crm-deal-edit-currency">
                                <input id="crm-deal-edit-currency" maxLength={3} className={`${INPUT_CLASS} !w-20`} value={form.currency} onChange={(event) => set({ currency: event.target.value.toUpperCase() })} />
                            </FormField>
                        </div>
                        <div className="flex gap-2">
                            <FormField label="Pipeline" htmlFor="crm-deal-edit-pipeline">
                                <select
                                    id="crm-deal-edit-pipeline"
                                    className={INPUT_CLASS}
                                    value={form.pipelineUid}
                                    onChange={(event) => {
                                        const next = pipelines.find((entry) => entry.uid === event.target.value)!;
                                        set({ pipelineUid: next.uid, stageId: next.stages[0].id });
                                    }}
                                >
                                    {pipelines.map((entry) => (
                                        <option key={entry.uid} value={entry.uid}>
                                            {entry.name}
                                        </option>
                                    ))}
                                </select>
                            </FormField>
                            <FormField label="Stage" htmlFor="crm-deal-edit-stage">
                                <select id="crm-deal-edit-stage" className={INPUT_CLASS} value={form.stageId} onChange={(event) => set({ stageId: event.target.value })}>
                                    {pipeline?.stages.map((stage) => (
                                        <option key={stage.id} value={stage.id}>
                                            {stage.name}
                                        </option>
                                    ))}
                                </select>
                            </FormField>
                        </div>
                        {selectedStage?.kind === "lost" && (
                            <FormField label="Why it was lost" htmlFor="crm-deal-edit-lost">
                                <input id="crm-deal-edit-lost" className={INPUT_CLASS} value={form.lostReason} onChange={(event) => set({ lostReason: event.target.value })} />
                            </FormField>
                        )}
                        <div className="flex gap-2">
                            <FormField label="Owner" htmlFor="crm-deal-edit-owner">
                                <select id="crm-deal-edit-owner" className={INPUT_CLASS} value={form.ownerUserUid} onChange={(event) => set({ ownerUserUid: event.target.value })}>
                                    <option value="">Nobody</option>
                                    {members.map((member) => (
                                        <option key={member.userUid} value={member.userUid}>
                                            {member.displayName || member.address || member.userUid}
                                        </option>
                                    ))}
                                </select>
                            </FormField>
                            <FormField label="Expected to close" htmlFor="crm-deal-edit-close">
                                <input id="crm-deal-edit-close" type="date" className={INPUT_CLASS} value={form.expectedCloseDate} onChange={(event) => set({ expectedCloseDate: event.target.value })} />
                            </FormField>
                        </div>
                        {canWrite && (
                            <div className="flex gap-2">
                                <Button type="submit" className="!w-auto">
                                    Save
                                </Button>
                                <Button type="button" variant="secondary" className="!w-auto !text-danger" onClick={() => void remove()}>
                                    Delete
                                </Button>
                            </div>
                        )}
                    </fieldset>
                </form>
                <People deal={deal} contacts={contacts} company={company} canWrite={canWrite} onSave={save} />
                <section aria-label="Stage history" className="mt-6">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted mb-2">Stage history</h2>
                    <ol className="flex flex-col gap-1 text-sm">
                        {[...deal.stageHistory].reverse().map((change) => (
                            <li key={`${change.stageId}-${change.at}`}>
                                {stageName(change.stageId)} <span className="text-xs text-text-muted">{new Date(change.at).toLocaleString()}</span>
                            </li>
                        ))}
                    </ol>
                </section>
            </div>
            <div className="flex flex-col gap-6">
                <Notes objectType="deal" uid={uid} notes={notes} onChange={loadActivity} />
                <Tasks objectType="deal" uid={uid} tasks={tasks} onChange={loadActivity} />
                <Activity timeline={timeline} />
            </div>
        </div>
    );
}

/** The contacts and company of a deal: adding a contact by searching, removing one, and choosing the company. */
function People({
    deal,
    contacts,
    company,
    canWrite,
    onSave,
}: {
    deal: Deal;
    contacts: Contact[];
    company: Company | null;
    canWrite: boolean;
    onSave: (input: { contactUids?: string[]; companyUid?: string | null }) => Promise<void>;
}) {
    const { workspace, href } = useCrm();
    const [query, setQuery] = useState("");
    const [found, setFound] = useState<(Contact | Company)[]>([]);
    const [kind, setKind] = useState<"contact" | "company">("contact");

    async function search(event: FormEvent): Promise<void> {
        event.preventDefault();
        try {
            setFound((await searchRecords<Contact | Company>(kind, workspace.uid, { q: query, limit: 8 })).items);
        } catch {
            setFound([]);
        }
    }

    return (
        <section aria-label="People" className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted mb-2">People</h2>
            <ul className="flex flex-col gap-1 text-sm mb-2">
                {contacts.map((contact) => (
                    <li key={contact.uid} className="flex justify-between">
                        <a className="text-primary-dark hover:underline" href={href(`/crm/contacts/${encodeURIComponent(contact.uid)}`)}>
                            {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email}
                        </a>
                        {canWrite && (
                            <button type="button" aria-label={`Remove ${contact.email}`} className="text-danger" onClick={() => void onSave({ contactUids: deal.contactUids.filter((uid) => uid !== contact.uid) })}>
                                &times;
                            </button>
                        )}
                    </li>
                ))}
                {company && (
                    <li className="flex justify-between">
                        <a className="text-primary-dark hover:underline" href={href(`/crm/companies/${encodeURIComponent(company.uid)}`)}>
                            {company.name}
                        </a>
                        {canWrite && (
                            <button type="button" aria-label={`Remove ${company.name}`} className="text-danger" onClick={() => void onSave({ companyUid: null })}>
                                &times;
                            </button>
                        )}
                    </li>
                )}
            </ul>
            {canWrite && (
                <form onSubmit={search} className="flex gap-1">
                    <select aria-label="Add a" className={`${INPUT_CLASS} !w-28`} value={kind} onChange={(event) => setKind(event.target.value as "contact" | "company")}>
                        <option value="contact">Contact</option>
                        <option value="company">Company</option>
                    </select>
                    <input aria-label="Find" placeholder="Find…" className={INPUT_CLASS} value={query} onChange={(event) => setQuery(event.target.value)} />
                    <Button type="submit" variant="secondary" className="!w-auto">
                        Find
                    </Button>
                </form>
            )}
            {found.length > 0 && (
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                    {found.map((record) => (
                        <li key={record.uid}>
                            <button
                                type="button"
                                className="text-primary-dark hover:underline"
                                onClick={() => {
                                    setFound([]);
                                    void onSave(kind === "contact" ? { contactUids: [...new Set([...deal.contactUids, record.uid])] } : { companyUid: record.uid });
                                }}
                            >
                                + {"email" in record ? record.email : record.name}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
