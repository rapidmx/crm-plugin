///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useRef, useState } from "react";
import { HiOutlineArrowUturnLeft, HiOutlineArrowUturnRight, HiOutlineEye, HiOutlinePaperAirplane, HiOutlineSwatch } from "react-icons/hi2";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import {
    DesignBlock,
    EmailTemplate,
    MergeTag,
    SavedBlock,
    TemplateDesign,
    WorkspaceSender,
    createSavedBlock,
    deleteSavedBlock,
    errorMessage,
    getTemplate,
    listMergeTags,
    listSavedBlocks,
    listSenders,
    updateTemplate,
} from "../../crmApi.js";
import { INPUT_CLASS, useCrm } from "../CrmShell.js";
import Canvas, { Selection } from "./Canvas.js";
import { BlockInspector, SectionInspector, ThemeInspector } from "./Inspector.js";
import MergeTagPicker from "./MergeTagPicker.js";
import PreviewModal from "./PreviewModal.js";
import TestSendModal from "./TestSendModal.js";
import {
    BLOCK_TYPES,
    History,
    blockLabel,
    addSection,
    designProblems,
    findBlock,
    getBlock,
    insertBlocks,
    newBlock,
    newSection,
    record,
    redo,
    undo,
    updateBlock,
    updateSection,
    withNewIds,
} from "./designModel.js";

/** The template's fields besides its design. */
interface Details {
    name: string;
    subject: string;
    preheader: string;
    category: string;
}

function detailsOf(template: EmailTemplate): Details {
    return { name: template.name, subject: template.subject, preheader: template.preheader ?? "", category: template.category ?? "" };
}

/** Whether a key press is meant for a text field or the text editor, rather than the designer's shortcuts. */
function typingIn(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    return !!element && (["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.isContentEditable);
}

/**
 * The email template designer: the template's name, subject and preview line; a palette of blocks, section layouts and saved blocks; the
 * canvas; and the settings of what's selected. Edits can be undone (Ctrl+Z) and redone (Ctrl+Shift+Z or Ctrl+Y); saving checks the
 * design here first, then on the server, and refuses to overwrite a newer version saved elsewhere. The preview renders the email as it's
 * sent, and a saved template can be sent as a test.
 */
export default function TemplateDesigner({ uid }: { uid: string }) {
    const { workspace, canWrite, canManage, href } = useCrm();
    const [template, setTemplate] = useState<EmailTemplate | null>(null);
    const [details, setDetails] = useState<Details | null>(null);
    const [history, setHistory] = useState<History | null>(null);
    const [selection, setSelection] = useState<Selection>({ kind: "theme" });
    const [mergeTags, setMergeTags] = useState<MergeTag[]>([]);
    const [savedBlocks, setSavedBlocks] = useState<SavedBlock[]>([]);
    const [senders, setSenders] = useState<WorkspaceSender[]>([]);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [testing, setTesting] = useState(false);
    const lastMerge = useRef<string | undefined>(undefined);
    const readOnly: boolean = !canWrite;

    useEffect(() => {
        getTemplate(workspace.uid, uid).then(
            (loaded) => {
                setTemplate(loaded);
                setDetails(detailsOf(loaded));
                setHistory({ past: [], present: loaded.design, future: [] });
            },
            (err) => setError(errorMessage(err, "Could not load the template.")),
        );
        listMergeTags(workspace.uid).then(setMergeTags, () => setMergeTags([]));
        listSavedBlocks(workspace.uid).then(setSavedBlocks, () => setSavedBlocks([]));
        listSenders(workspace.uid).then(setSenders, () => setSenders([]));
    }, [workspace.uid, uid]);

    useEffect(() => {
        if (!dirty) {
            return;
        }
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    useEffect(() => {
        function onKey(event: KeyboardEvent): void {
            if (!(event.ctrlKey || event.metaKey) || typingIn(event.target)) {
                return;
            }
            const key: string = event.key.toLowerCase();
            if (key === "z" || key === "y") {
                event.preventDefault();
                lastMerge.current = undefined;
                setHistory((current) => current && (key === "y" || event.shiftKey ? redo(current) : undo(current)));
                setDirty(true);
            }
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    if (!template || !details || !history) {
        return error ? <Alert>{error}</Alert> : <p className="text-sm text-text-muted">Loading&hellip;</p>;
    }

    const design: TemplateDesign = history.present;
    const problems = designProblems(design);

    /** Makes `next` the design; edits sharing a `mergeKey` in a row are undone as one. */
    function change(next: TemplateDesign, mergeKey?: string): void {
        const merge: boolean = mergeKey !== undefined && mergeKey === lastMerge.current;
        lastMerge.current = mergeKey;
        setHistory((current) => (merge ? { ...current!, present: next } : record(current!, next)));
        setDirty(true);
        setNotice(null);
    }

    function changeDetails(patch: Partial<Details>): void {
        setDetails({ ...details!, ...patch });
        setDirty(true);
        setNotice(null);
    }

    /** Puts `blocks` after the selected block, else at the end of the selected section's first column, else of the last section. */
    function place(blocks: DesignBlock[]): void {
        let next: TemplateDesign = design;
        let columnId: string;
        let index: number;
        const at = selection.kind === "block" ? findBlock(design, selection.id) : undefined;
        if (at) {
            columnId = design.sections[at.section].columns[at.column].id;
            index = at.index + 1;
        } else {
            let section = selection.kind === "section" ? design.sections.find((entry) => entry.id === selection.id) : design.sections[design.sections.length - 1];
            if (!section) {
                section = newSection(1);
                next = addSection(next, next.sections.length, section);
            }
            columnId = section.columns[0].id;
            index = section.columns[0].blocks.length;
        }
        change(insertBlocks(next, columnId, index, blocks));
        setSelection({ kind: "block", id: blocks[0].id });
    }

    function addSectionOf(columns: number): void {
        const section = newSection(columns);
        const selected: number = selection.kind === "section" ? design.sections.findIndex((entry) => entry.id === selection.id) : -1;
        change(addSection(design, selected >= 0 ? selected + 1 : design.sections.length, section));
        setSelection({ kind: "section", id: section.id });
    }

    async function save(): Promise<void> {
        if (problems.length > 0) {
            setError(problems[0].message);
            setSelection({ kind: "block", id: problems[0].blockId });
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const saved: EmailTemplate = await updateTemplate(workspace.uid, template!.uid, {
                name: details!.name,
                subject: details!.subject,
                preheader: details!.preheader || null,
                category: details!.category || null,
                design,
                version: template!.version,
            });
            setTemplate(saved);
            setHistory((current) => ({ ...current!, present: saved.design }));
            lastMerge.current = undefined;
            setDirty(false);
            setNotice(saved.hasUnsubscribeLink ? "Saved." : "Saved. Add a footer or an unsubscribe link before using this template in a campaign.");
        } catch (err) {
            setError(errorMessage(err, "Could not save the template."));
        }
        setSaving(false);
    }

    async function saveForReuse(block: DesignBlock): Promise<void> {
        const name: string | null = window.prompt("Name this block, to find it in the palette:", blockLabel(block.type));
        if (!name?.trim()) {
            return;
        }
        try {
            const saved: SavedBlock = await createSavedBlock(workspace.uid, { name: name.trim(), blocks: [block] });
            setSavedBlocks([saved, ...savedBlocks]);
        } catch (err) {
            setError(errorMessage(err, "Could not save the block."));
        }
    }

    async function forgetSaved(saved: SavedBlock): Promise<void> {
        if (!window.confirm(`Delete the saved block "${saved.name}"? Templates using it keep their copy.`)) {
            return;
        }
        try {
            await deleteSavedBlock(workspace.uid, saved.uid);
            setSavedBlocks(savedBlocks.filter((entry) => entry.uid !== saved.uid));
        } catch (err) {
            setError(errorMessage(err, "Could not delete the saved block."));
        }
    }

    const selectedBlock: DesignBlock | undefined = selection.kind === "block" ? getBlock(design, selection.id) : undefined;
    const selectedSection = selection.kind === "section" ? design.sections.find((entry) => entry.id === selection.id) : undefined;
    const paletteButton = "text-left text-sm px-2 py-1.5 rounded-sm border border-border hover:border-primary hover:bg-surface-alt disabled:opacity-50";

    return (
        <div className="flex flex-col h-full -m-6">
            <header className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border">
                <a href={href("/crm/templates")} className="text-sm text-primary-dark hover:underline">
                    &larr; Templates
                </a>
                <input aria-label="Template name" className={`${INPUT_CLASS} !w-56 font-semibold`} value={details.name} readOnly={readOnly} onChange={(event) => changeDetails({ name: event.target.value })} />
                <div className="flex items-center gap-0.5 ml-auto">
                    <button
                        type="button"
                        title="Undo (Ctrl+Z)"
                        aria-label="Undo"
                        disabled={history.past.length === 0}
                        className="p-1.5 rounded-sm hover:bg-surface-alt disabled:opacity-40"
                        onClick={() => {
                            lastMerge.current = undefined;
                            setHistory(undo(history));
                            setDirty(true);
                        }}
                    >
                        <HiOutlineArrowUturnLeft aria-hidden className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        title="Redo (Ctrl+Shift+Z)"
                        aria-label="Redo"
                        disabled={history.future.length === 0}
                        className="p-1.5 rounded-sm hover:bg-surface-alt disabled:opacity-40"
                        onClick={() => {
                            lastMerge.current = undefined;
                            setHistory(redo(history));
                            setDirty(true);
                        }}
                    >
                        <HiOutlineArrowUturnRight aria-hidden className="w-4 h-4" />
                    </button>
                    <Button type="button" variant="secondary" className="!w-auto !py-1.5" onClick={() => setSelection({ kind: "theme" })}>
                        <HiOutlineSwatch aria-hidden /> Theme
                    </Button>
                    <Button type="button" variant="secondary" className="!w-auto !py-1.5" onClick={() => setPreviewing(true)}>
                        <HiOutlineEye aria-hidden /> Preview
                    </Button>
                    {!readOnly && (
                        <Button
                            type="button"
                            variant="secondary"
                            className="!w-auto !py-1.5"
                            disabled={dirty}
                            title={dirty ? "Save first: a test sends the saved template." : undefined}
                            onClick={() => setTesting(true)}
                        >
                            <HiOutlinePaperAirplane aria-hidden /> Send test
                        </Button>
                    )}
                    {!readOnly && (
                        <Button type="button" className="!w-auto !py-1.5" loading={saving} disabled={saving || !dirty} onClick={() => void save()}>
                            {dirty ? "Save" : "Saved"}
                        </Button>
                    )}
                </div>
            </header>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center px-4 py-2 border-b border-border text-sm">
                <label htmlFor="crm-template-subject" className="text-text-muted">
                    Subject
                </label>
                <div className="flex gap-2">
                    <input id="crm-template-subject" className={INPUT_CLASS} value={details.subject} readOnly={readOnly} onChange={(event) => changeDetails({ subject: event.target.value })} />
                    {!readOnly && <MergeTagPicker tags={mergeTags} label="Insert merge tag into subject" onPick={(tag) => changeDetails({ subject: `${details.subject}{{ ${tag} }}` })} />}
                </div>
                <label htmlFor="crm-template-preheader" className="text-text-muted">
                    Preview text
                </label>
                <input
                    id="crm-template-preheader"
                    className={INPUT_CLASS}
                    placeholder="The line inboxes show after the subject"
                    value={details.preheader}
                    readOnly={readOnly}
                    onChange={(event) => changeDetails({ preheader: event.target.value })}
                />
                <label htmlFor="crm-template-category" className="text-text-muted">
                    Category
                </label>
                <input id="crm-template-category" className={`${INPUT_CLASS} !w-56`} value={details.category} readOnly={readOnly} onChange={(event) => changeDetails({ category: event.target.value })} />
            </div>
            {(error || notice) && <div className="px-4 pt-2">{error ? <Alert>{error}</Alert> : <p role="status" className="text-sm text-success">{notice}</p>}</div>}
            <div className="flex flex-1 min-h-0">
                {!readOnly && (
                    <aside aria-label="Blocks" className="w-52 shrink-0 border-r border-border p-3 overflow-y-auto">
                        <h2 className="text-xs uppercase tracking-wide text-text-muted mb-2">Blocks</h2>
                        <div className="grid grid-cols-2 gap-1 mb-4">
                            {BLOCK_TYPES.filter(({ type }) => type !== "html" || canManage).map(({ type, label }) => (
                                <button key={type} type="button" className={paletteButton} onClick={() => place([newBlock(type)])}>
                                    {label}
                                </button>
                            ))}
                        </div>
                        <h2 className="text-xs uppercase tracking-wide text-text-muted mb-2">Sections</h2>
                        <div className="grid grid-cols-2 gap-1 mb-4">
                            {[1, 2, 3, 4].map((columns) => (
                                <button key={columns} type="button" className={paletteButton} onClick={() => addSectionOf(columns)}>
                                    {columns === 1 ? "1 column" : `${columns} columns`}
                                </button>
                            ))}
                        </div>
                        <h2 className="text-xs uppercase tracking-wide text-text-muted mb-2">Saved blocks</h2>
                        {savedBlocks.length === 0 ? (
                            <p className="text-xs text-text-muted">Select a block and choose &ldquo;Save for reuse&rdquo; to keep it here.</p>
                        ) : (
                            <ul className="flex flex-col gap-1">
                                {savedBlocks.map((saved) => (
                                    <li key={saved.uid} className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            className={`${paletteButton} flex-1 min-w-0 truncate`}
                                            disabled={!canManage && saved.blocks.some((block) => block.type === "html")}
                                            onClick={() => place(withNewIds(saved.blocks))}
                                        >
                                            {saved.name}
                                        </button>
                                        <button type="button" aria-label={`Delete saved block ${saved.name}`} className="px-1 text-text-muted hover:text-danger" onClick={() => void forgetSaved(saved)}>
                                            &times;
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </aside>
                )}
                <div className="flex-1 min-w-0 overflow-auto">
                    <Canvas
                        design={design}
                        selection={selection}
                        onSelect={setSelection}
                        onChange={change}
                        mergeTags={mergeTags}
                        problemIds={new Set(problems.map((problem) => problem.blockId))}
                        onSaveBlock={(block) => void saveForReuse(block)}
                        readOnly={readOnly}
                    />
                </div>
                <aside aria-label="Settings" className="w-72 shrink-0 border-l border-border p-3 overflow-y-auto">
                    <fieldset disabled={readOnly}>
                        {selectedBlock ? (
                            <BlockInspector
                                key={selectedBlock.id}
                                block={selectedBlock}
                                theme={design.theme}
                                mergeTags={mergeTags}
                                canManage={canManage}
                                onChange={(patch) => change(updateBlock(design, selectedBlock.id, patch), `block:${selectedBlock.id}:${Object.keys(patch).join(",")}`)}
                            />
                        ) : selectedSection ? (
                            <SectionInspector
                                section={selectedSection}
                                theme={design.theme}
                                onChange={(patch) => change(updateSection(design, selectedSection.id, patch), `section:${selectedSection.id}:${Object.keys(patch).join(",")}`)}
                            />
                        ) : (
                            <ThemeInspector theme={design.theme} onChange={(patch) => change({ ...design, theme: { ...design.theme, ...patch } }, `theme:${Object.keys(patch).join(",")}`)} />
                        )}
                    </fieldset>
                </aside>
            </div>
            <PreviewModal open={previewing} onClose={() => setPreviewing(false)} workspaceUid={workspace.uid} design={design} subject={details.subject} preheader={details.preheader} />
            <TestSendModal open={testing} onClose={() => setTesting(false)} workspaceUid={workspace.uid} templateUid={template.uid} senders={senders} />
        </div>
    );
}
