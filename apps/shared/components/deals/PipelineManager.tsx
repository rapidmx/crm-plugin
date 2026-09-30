///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import { Pipeline, PipelineStage, StageKind, createPipeline, deletePipeline, errorMessage, listPipelines, updatePipeline } from "../../crmApi.js";
import { INPUT_CLASS, useCrm } from "../CrmShell.js";

/** A stage as the editor holds it: a new one has no id yet. */
type StageDraft = Omit<PipelineStage, "id"> & { id?: string };

/**
 * A workspace's pipelines and their stages: renaming, reordering, adding and removing stages (each with its probability, kind and
 * "rotting" days), choosing the default pipeline, and creating and deleting pipelines. Changing them takes an admin; everyone sees
 * them.
 */
export default function PipelineManager() {
    const { workspace, canManage } = useCrm();
    const [pipelines, setPipelines] = useState<Pipeline[]>([]);
    const [error, setError] = useState<string | null>(null);

    async function load(): Promise<void> {
        try {
            setPipelines(await listPipelines(workspace.uid));
        } catch (err) {
            setError(errorMessage(err, "Could not load the pipelines."));
        }
    }

    useEffect(() => {
        void load();
    }, [workspace.uid]);

    async function run(action: () => Promise<unknown>, failure: string): Promise<void> {
        setError(null);
        try {
            await action();
            await load();
        } catch (err) {
            setError(errorMessage(err, failure));
        }
    }

    return (
        <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-lg font-bold tracking-tight">Pipelines</h1>
                {canManage && (
                    <Button
                        type="button"
                        className="!w-auto"
                        onClick={() => {
                            const name: string | null = window.prompt("Name of the new pipeline:", "");
                            if (name?.trim()) {
                                void run(() => createPipeline(workspace.uid, { name: name.trim() }), "Could not create the pipeline.");
                            }
                        }}
                    >
                        + New pipeline
                    </Button>
                )}
            </div>
            {error && <Alert>{error}</Alert>}
            <div className="flex flex-col gap-6">
                {pipelines.map((pipeline) => (
                    <PipelineEditor
                        key={`${pipeline.uid}-${pipeline.version}`}
                        pipeline={pipeline}
                        canManage={canManage}
                        onSave={(input) => run(() => updatePipeline(workspace.uid, pipeline.uid, { ...input }), "Could not save the pipeline.")}
                        onDelete={() => {
                            if (window.confirm(`Delete the pipeline "${pipeline.name}"?`)) {
                                void run(() => deletePipeline(workspace.uid, pipeline.uid), "Could not delete the pipeline.");
                            }
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

function PipelineEditor({
    pipeline,
    canManage,
    onSave,
    onDelete,
}: {
    pipeline: Pipeline;
    canManage: boolean;
    onSave: (input: { name?: string; stages?: StageDraft[]; isDefault?: boolean }) => Promise<void>;
    onDelete: () => void;
}) {
    const [name, setName] = useState(pipeline.name);
    const [stages, setStages] = useState<StageDraft[]>(pipeline.stages);
    const change = (index: number, patch: Partial<StageDraft>) => setStages(stages.map((stage, at) => (at === index ? { ...stage, ...patch } : stage)));
    const moveStage = (index: number, delta: -1 | 1) => {
        const next: StageDraft[] = [...stages];
        [next[index], next[index + delta]] = [next[index + delta], next[index]];
        setStages(next);
    };

    return (
        <section aria-label={pipeline.name} className="border border-border rounded-sm p-4">
            <fieldset disabled={!canManage}>
                <div className="flex items-center gap-2 mb-3">
                    <input aria-label="Pipeline name" className={`${INPUT_CLASS} !w-64 font-semibold`} value={name} onChange={(event) => setName(event.target.value)} />
                    {pipeline.isDefault ? (
                        <span className="text-xs rounded-full px-2 py-0.5 bg-primary-lightest text-primary-dark">Default</span>
                    ) : (
                        canManage && (
                            <button type="button" className="text-xs text-primary-dark hover:underline" onClick={() => void onSave({ isDefault: true })}>
                                Make default
                            </button>
                        )
                    )}
                </div>
                <table className="w-full text-sm border-collapse mb-3">
                    <thead>
                        <tr>
                            {["Stage", "Probability %", "Kind", "Rotting after (days)", ""].map((heading) => (
                                <th key={heading} className="text-left text-xs uppercase tracking-wide text-text-muted py-1 px-1.5 border-b border-border">
                                    {heading}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {stages.map((stage, index) => (
                            <tr key={stage.id ?? `new-${index}`}>
                                <td className="py-1 px-1.5">
                                    <input aria-label={`Stage ${index + 1} name`} className={INPUT_CLASS} value={stage.name} onChange={(event) => change(index, { name: event.target.value })} />
                                </td>
                                <td className="py-1 px-1.5">
                                    <input
                                        aria-label={`Stage ${index + 1} probability`}
                                        type="number"
                                        min={0}
                                        max={100}
                                        className={`${INPUT_CLASS} !w-20`}
                                        value={stage.probability}
                                        onChange={(event) => change(index, { probability: Number(event.target.value) })}
                                    />
                                </td>
                                <td className="py-1 px-1.5">
                                    <select aria-label={`Stage ${index + 1} kind`} className={`${INPUT_CLASS} !w-24`} value={stage.kind} onChange={(event) => change(index, { kind: event.target.value as StageKind })}>
                                        <option value="open">Open</option>
                                        <option value="won">Won</option>
                                        <option value="lost">Lost</option>
                                    </select>
                                </td>
                                <td className="py-1 px-1.5">
                                    <input
                                        aria-label={`Stage ${index + 1} rotting days`}
                                        type="number"
                                        min={1}
                                        className={`${INPUT_CLASS} !w-20`}
                                        value={stage.rottingDays ?? ""}
                                        onChange={(event) => change(index, { rottingDays: event.target.value ? Number(event.target.value) : null })}
                                    />
                                </td>
                                <td className="py-1 px-1.5 whitespace-nowrap text-right">
                                    {canManage && (
                                        <>
                                            <button type="button" aria-label={`Move stage ${index + 1} up`} disabled={index === 0} className="px-1 disabled:opacity-30" onClick={() => moveStage(index, -1)}>
                                                ↑
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={`Move stage ${index + 1} down`}
                                                disabled={index === stages.length - 1}
                                                className="px-1 disabled:opacity-30"
                                                onClick={() => moveStage(index, 1)}
                                            >
                                                ↓
                                            </button>
                                            <button type="button" aria-label={`Remove stage ${index + 1}`} className="px-1 text-danger" onClick={() => setStages(stages.filter((_stage, at) => at !== index))}>
                                                &times;
                                            </button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {canManage && (
                    <div className="flex gap-2">
                        <Button type="button" variant="secondary" className="!w-auto" onClick={() => setStages([...stages, { name: "New stage", probability: 50, kind: "open" }])}>
                            + Add stage
                        </Button>
                        <Button type="button" className="!w-auto" onClick={() => void onSave({ name: name.trim(), stages: stages.map(({ rottingDays, ...stage }) => ({ ...stage, ...(rottingDays ? { rottingDays } : {}) })) })}>
                            Save
                        </Button>
                        {!pipeline.isDefault && (
                            <Button type="button" variant="secondary" className="!w-auto !text-danger ml-auto" onClick={onDelete}>
                                Delete pipeline
                            </Button>
                        )}
                    </div>
                )}
            </fieldset>
        </section>
    );
}
