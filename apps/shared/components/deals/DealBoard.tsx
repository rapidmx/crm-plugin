///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import Modal from "@rapidmx/web-client/lib/components/overlays/Modal.js";
import {
    Deal,
    Forecast,
    Pipeline,
    PipelineStage,
    WorkspaceMember,
    createDeal,
    dealForecast,
    errorMessage,
    listDeals,
    listMembers,
    listPipelines,
    updateDeal,
} from "../../crmApi.js";
import { INPUT_CLASS, useCrm } from "../CrmShell.js";
import { daysInStage, isRotting, money } from "./dealUi.js";

/** How far back won and lost deals show on the board, and count in the forecast. */
const CLOSED_DAYS = 30;

function memberName(members: WorkspaceMember[], userUid: string | null | undefined): string | undefined {
    const member = members.find((entry) => entry.userUid === userUid);
    return member ? member.displayName || member.address || member.userUid : undefined;
}

/** One deal's card: dragged to another stage, or moved with its "Move to" menu. */
function DealCard({ deal, stage, stages, members, canWrite, onMove }: { deal: Deal; stage: PipelineStage; stages: PipelineStage[]; members: WorkspaceMember[]; canWrite: boolean; onMove: (deal: Deal, stageId: string) => void }) {
    const { href } = useCrm();
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.uid, disabled: !canWrite });
    const rotting: boolean = isRotting(deal, stage);
    return (
        <li
            ref={setNodeRef}
            style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, opacity: isDragging ? 0.6 : 1 }}
            className={`rounded-sm border bg-surface p-2 text-sm ${rotting ? "border-warning" : "border-border"}`}
        >
            <div className="flex items-start gap-1">
                {canWrite && (
                    <button type="button" aria-label={`Drag ${deal.name}`} className="cursor-grab text-text-muted px-0.5" {...attributes} {...listeners}>
                        ⋮⋮
                    </button>
                )}
                <a className="font-medium text-primary-dark hover:underline flex-1 min-w-0" href={href(`/crm/deals/${encodeURIComponent(deal.uid)}`)}>
                    {deal.name}
                </a>
            </div>
            <div className="text-xs text-text-muted mt-1">
                {money(deal.amount, deal.currency)}
                {memberName(members, deal.ownerUserUid) ? ` · ${memberName(members, deal.ownerUserUid)}` : ""}
            </div>
            {rotting && <div className="text-xs text-warning mt-1">{daysInStage(deal)} days in this stage</div>}
            {canWrite && (
                <select aria-label={`Move ${deal.name} to`} className="mt-1 w-full text-xs border border-border rounded-sm bg-surface" value={deal.stageId} onChange={(event) => onMove(deal, event.target.value)}>
                    {stages.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                            {entry.name}
                        </option>
                    ))}
                </select>
            )}
        </li>
    );
}

/** One stage's column: its numbers, and its deals. Deals are dropped on it to move there. */
function StageColumn({ stage, deals, forecast, children }: { stage: PipelineStage; deals: Deal[]; forecast?: { amount: number; weighted: number }; children: React.ReactNode }) {
    const { setNodeRef, isOver } = useDroppable({ id: stage.id });
    const currency: string = deals[0]?.currency ?? "USD";
    return (
        <section ref={setNodeRef} aria-label={stage.name} className={`w-64 shrink-0 rounded-sm bg-surface-alt p-2 ${isOver ? "ring-2 ring-primary" : ""}`}>
            <header className="mb-2">
                <div className="flex justify-between text-sm font-semibold">
                    <span>{stage.name}</span>
                    <span className="text-text-muted">{deals.length}</span>
                </div>
                <div className="text-xs text-text-muted">
                    {stage.kind === "open" ? `${stage.probability}% · ${money(forecast?.amount ?? 0, currency)} (${money(forecast?.weighted ?? 0, currency)} weighted)` : `last ${CLOSED_DAYS} days`}
                </div>
            </header>
            <ul className="flex flex-col gap-2">{children}</ul>
        </section>
    );
}

/**
 * A pipeline's deals as a board: a column per stage, with each open stage's total and weighted total, the pipeline's forecast, and
 * deals rotting in their stage flagged. Deals move by dragging (pointer or keyboard) or with their "Move to" menu; moving one to a
 * lost stage asks why.
 */
export default function DealBoard() {
    const { workspace, canWrite } = useCrm();
    const [pipelines, setPipelines] = useState<Pipeline[]>([]);
    const [pipelineUid, setPipelineUid] = useState<string>("");
    const [deals, setDeals] = useState<Deal[]>([]);
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [owner, setOwner] = useState("");
    const [forecast, setForecast] = useState<Forecast | null>(null);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
    const pipeline: Pipeline | undefined = pipelines.find((entry) => entry.uid === pipelineUid);

    useEffect(() => {
        listPipelines(workspace.uid).then(
            (loaded) => {
                setPipelines(loaded);
                setPipelineUid((loaded.find((entry) => entry.isDefault) ?? loaded[0])?.uid ?? "");
            },
            (err) => setError(errorMessage(err, "Could not load the pipelines.")),
        );
        listMembers(workspace.uid).then(setMembers, () => setMembers([]));
    }, [workspace.uid]);

    async function load(): Promise<void> {
        if (!pipelineUid) {
            return;
        }
        try {
            const since: number = Date.now() - CLOSED_DAYS * 86_400_000;
            const loaded: Deal[] = await listDeals(workspace.uid, { pipelineUid, ...(owner ? { ownerUserUid: owner } : {}) });
            setDeals(loaded.filter((deal) => deal.status === "open" || new Date(deal.closedAt ?? 0).getTime() >= since));
            setForecast(await dealForecast(workspace.uid, pipelineUid, CLOSED_DAYS));
        } catch (err) {
            setError(errorMessage(err, "Could not load the deals."));
        }
    }

    useEffect(() => {
        void load();
    }, [pipelineUid, owner]);

    async function move(deal: Deal, stageId: string): Promise<void> {
        if (stageId === deal.stageId) {
            return;
        }
        const stage: PipelineStage | undefined = pipeline?.stages.find((entry) => entry.id === stageId);
        let lostReason: string | undefined;
        if (stage?.kind === "lost") {
            const reason: string | null = window.prompt(`Why was "${deal.name}" lost?`, "");
            if (reason === null) {
                return;
            }
            lostReason = reason.trim() || undefined;
        }
        // Moved on the board at once; put back if the server refuses.
        setDeals(deals.map((entry) => (entry.uid === deal.uid ? { ...entry, stageId } : entry)));
        try {
            await updateDeal(workspace.uid, deal.uid, { stageId, ...(lostReason ? { lostReason } : {}) });
        } catch (err) {
            setError(errorMessage(err, "Could not move the deal."));
        }
        await load();
    }

    function dragEnd(event: DragEndEvent): void {
        const deal: Deal | undefined = deals.find((entry) => entry.uid === event.active.id);
        if (deal && event.over) {
            void move(deal, String(event.over.id));
        }
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <h1 className="text-lg font-bold tracking-tight mr-2">Deals</h1>
                <select aria-label="Pipeline" className={`${INPUT_CLASS} !w-48`} value={pipelineUid} onChange={(event) => setPipelineUid(event.target.value)}>
                    {pipelines.map((entry) => (
                        <option key={entry.uid} value={entry.uid}>
                            {entry.name}
                        </option>
                    ))}
                </select>
                <select aria-label="Owner" className={`${INPUT_CLASS} !w-48`} value={owner} onChange={(event) => setOwner(event.target.value)}>
                    <option value="">Everyone&apos;s deals</option>
                    {members.map((member) => (
                        <option key={member.userUid} value={member.userUid}>
                            {memberName(members, member.userUid)}
                        </option>
                    ))}
                </select>
                {forecast && (
                    <p role="status" className="text-sm text-text-muted">
                        {forecast.open.count} open · {money(forecast.open.amount, deals[0]?.currency ?? "USD")} ({money(forecast.open.weighted, deals[0]?.currency ?? "USD")} weighted)
                        {forecast.winRate !== undefined && ` · ${Math.round(forecast.winRate * 100)}% won in the last ${CLOSED_DAYS} days`}
                        {forecast.averageDaysToWin !== undefined && ` · ${Math.round(forecast.averageDaysToWin)} days to win`}
                    </p>
                )}
                {canWrite && pipeline && (
                    <Button type="button" className="!w-auto ml-auto" onClick={() => setCreating(true)}>
                        + New deal
                    </Button>
                )}
            </div>
            {error && <Alert>{error}</Alert>}
            {pipeline && (
                <DndContext sensors={sensors} onDragEnd={dragEnd}>
                    <div className="flex gap-3 overflow-x-auto pb-4">
                        {pipeline.stages.map((stage) => {
                            const here: Deal[] = deals.filter((deal) => deal.stageId === stage.id);
                            return (
                                <StageColumn key={stage.id} stage={stage} deals={here} forecast={forecast?.stages.find((entry) => entry.stageId === stage.id)}>
                                    {here.map((deal) => (
                                        <DealCard key={deal.uid} deal={deal} stage={stage} stages={pipeline.stages} members={members} canWrite={canWrite} onMove={(target, stageId) => void move(target, stageId)} />
                                    ))}
                                </StageColumn>
                            );
                        })}
                    </div>
                </DndContext>
            )}
            {creating && pipeline && (
                <NewDealModal
                    pipeline={pipeline}
                    onClose={() => setCreating(false)}
                    onCreated={() => {
                        setCreating(false);
                        void load();
                    }}
                />
            )}
        </div>
    );
}

/** Asks for a new deal's name, amount and stage. */
function NewDealModal({ pipeline, onClose, onCreated }: { pipeline: Pipeline; onClose: () => void; onCreated: () => void }) {
    const { workspace } = useCrm();
    const [name, setName] = useState("");
    const [amount, setAmount] = useState("");
    const [currency, setCurrency] = useState("USD");
    const [stageId, setStageId] = useState(pipeline.stages[0].id);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setSaving(true);
        try {
            await createDeal(workspace.uid, { name: name.trim(), amount: Number(amount) || 0, currency, pipelineUid: pipeline.uid, stageId });
            onCreated();
        } catch (err) {
            setError(errorMessage(err, "Could not create the deal."));
            setSaving(false);
        }
    }

    return (
        <Modal open onClose={onClose} title="New deal">
            <form onSubmit={submit} className="flex flex-col gap-3 min-w-[22rem]">
                {error && <Alert>{error}</Alert>}
                <FormField label="Name" htmlFor="crm-deal-name">
                    <input id="crm-deal-name" className={INPUT_CLASS} value={name} onChange={(event) => setName(event.target.value)} required />
                </FormField>
                <div className="flex gap-2">
                    <FormField label="Amount" htmlFor="crm-deal-amount">
                        <input id="crm-deal-amount" type="number" min={0} className={INPUT_CLASS} value={amount} onChange={(event) => setAmount(event.target.value)} />
                    </FormField>
                    <FormField label="Currency" htmlFor="crm-deal-currency">
                        <input id="crm-deal-currency" className={`${INPUT_CLASS} !w-20 uppercase`} maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} />
                    </FormField>
                </div>
                <FormField label="Stage" htmlFor="crm-deal-stage">
                    <select id="crm-deal-stage" className={INPUT_CLASS} value={stageId} onChange={(event) => setStageId(event.target.value)}>
                        {pipeline.stages.map((stage) => (
                            <option key={stage.id} value={stage.id}>
                                {stage.name}
                            </option>
                        ))}
                    </select>
                </FormField>
                <Button type="submit" loading={saving} disabled={saving || !name.trim()} className="!w-auto self-start">
                    Create
                </Button>
            </form>
        </Modal>
    );
}
