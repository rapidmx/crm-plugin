///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { KeyboardEvent, ReactNode } from "react";
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { HiOutlineArrowDown, HiOutlineArrowUp, HiOutlineBookmark, HiOutlineDocumentDuplicate, HiOutlineTrash } from "react-icons/hi2";
import { MdDragIndicator } from "react-icons/md";
import type { IconType } from "react-icons";
import type { DesignBlock, DesignColumn, DesignSection, MergeTag, TemplateDesign } from "../../crmApi.js";
import BlockView from "./BlockView.js";
import LazyTextBlockEditor from "./LazyTextBlockEditor.js";
import { blockLabel, dropBlock, duplicateBlock, nudgeBlock, nudgeSection, removeBlock, removeSection, updateBlock } from "./designModel.js";

/** What the designer has selected: a block, a section, or the theme. */
export type Selection = { kind: "block"; id: string } | { kind: "section"; id: string } | { kind: "theme" };

export interface CanvasProps {
    design: TemplateDesign;
    selection: Selection;
    onSelect: (selection: Selection) => void;
    /** A changed design; `mergeKey` names a run of edits (typing in one block) that undo takes back together. */
    onChange: (design: TemplateDesign, mergeKey?: string) => void;
    mergeTags: MergeTag[];
    /** Blocks with something to fix before saving. */
    problemIds: Set<string>;
    /** Offers `block` for saving as a reusable block; `undefined` when the caller can't. */
    onSaveBlock?: (block: DesignBlock) => void;
    readOnly: boolean;
}

function ToolButton({ label, icon: Icon, onClick, disabled }: { label: string; icon: IconType; onClick: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            disabled={disabled}
            onClick={(event) => {
                event.stopPropagation();
                onClick();
            }}
            className="p-1 rounded-sm text-text-muted hover:text-text hover:bg-surface-alt disabled:opacity-40"
        >
            <Icon aria-hidden className="w-4 h-4" />
        </button>
    );
}

/** Selects on Enter or Space, for elements that select on click. */
function selectOnKey(select: () => void) {
    return (event: KeyboardEvent) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            select();
        }
    };
}

function SortableBlock({ block, index, count, props }: { block: DesignBlock; index: number; count: number; props: CanvasProps }) {
    const { design, selection, onSelect, onChange, mergeTags, problemIds, onSaveBlock, readOnly } = props;
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: readOnly });
    const selected: boolean = selection.kind === "block" && selection.id === block.id;
    const label: string = blockLabel(block.type);
    return (
        <div
            ref={setNodeRef}
            style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition, opacity: isDragging ? 0.5 : 1 }}
            className={`group relative outline-offset-[-1px] ${selected ? "outline outline-2 outline-primary" : "hover:outline hover:outline-1 hover:outline-primary/50"} ${
                problemIds.has(block.id) ? "outline outline-2 outline-danger" : ""
            }`}
            role="group"
            aria-label={`${label} block`}
            tabIndex={0}
            onClick={(event) => {
                event.stopPropagation();
                onSelect({ kind: "block", id: block.id });
            }}
            onKeyDown={selectOnKey(() => onSelect({ kind: "block", id: block.id }))}
        >
            {selected && !readOnly && (
                <div className="absolute -top-7 right-0 z-10 flex items-center gap-0.5 bg-surface border border-border rounded-sm shadow-sm px-0.5">
                    <button type="button" aria-label={`Drag ${label}`} title="Drag" className="p-1 cursor-grab text-text-muted" {...attributes} {...listeners}>
                        <MdDragIndicator aria-hidden className="w-4 h-4" />
                    </button>
                    <ToolButton label="Move up" icon={HiOutlineArrowUp} disabled={index === 0} onClick={() => onChange(nudgeBlock(design, block.id, -1))} />
                    <ToolButton label="Move down" icon={HiOutlineArrowDown} disabled={index === count - 1} onClick={() => onChange(nudgeBlock(design, block.id, 1))} />
                    <ToolButton
                        label="Duplicate"
                        icon={HiOutlineDocumentDuplicate}
                        onClick={() => {
                            const copy = duplicateBlock(design, block.id);
                            onChange(copy.design);
                            onSelect({ kind: "block", id: copy.id });
                        }}
                    />
                    {onSaveBlock && <ToolButton label="Save for reuse" icon={HiOutlineBookmark} onClick={() => onSaveBlock(block)} />}
                    <ToolButton
                        label="Delete block"
                        icon={HiOutlineTrash}
                        onClick={() => {
                            onChange(removeBlock(design, block.id));
                            onSelect({ kind: "theme" });
                        }}
                    />
                </div>
            )}
            {selected && !readOnly && block.type === "text" ? (
                <div style={{ padding: block.padding ?? 8, textAlign: block.align }}>
                    <LazyTextBlockEditor
                        key={block.id}
                        value={block.html}
                        mergeTags={mergeTags}
                        onChange={(html) => onChange(updateBlock(design, block.id, { html }), `text:${block.id}`)}
                    />
                </div>
            ) : (
                <BlockView block={block} theme={design.theme} />
            )}
        </div>
    );
}

function Column({ column, props }: { column: DesignColumn; props: CanvasProps }) {
    const { setNodeRef, isOver } = useDroppable({ id: column.id, disabled: props.readOnly });
    return (
        <div ref={setNodeRef} className={`flex-1 min-w-0 min-h-[3rem] ${isOver ? "bg-primary-lightest/40" : ""}`}>
            <SortableContext items={column.blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
                {column.blocks.map((block, index) => (
                    <SortableBlock key={block.id} block={block} index={index} count={column.blocks.length} props={props} />
                ))}
            </SortableContext>
            {column.blocks.length === 0 && <div className="m-2 border border-dashed border-border py-4 text-center text-xs text-text-muted">Empty column</div>}
        </div>
    );
}

function Section({ section, index, props }: { section: DesignSection; index: number; props: CanvasProps }) {
    const { design, selection, onSelect, onChange, readOnly } = props;
    const selected: boolean = selection.kind === "section" && selection.id === section.id;
    const tools: ReactNode = selected && !readOnly && (
        <div className="absolute top-0 -left-9 z-10 flex flex-col bg-surface border border-border rounded-sm shadow-sm">
            <ToolButton label="Move section up" icon={HiOutlineArrowUp} disabled={index === 0} onClick={() => onChange(nudgeSection(design, section.id, -1))} />
            <ToolButton label="Move section down" icon={HiOutlineArrowDown} disabled={index === design.sections.length - 1} onClick={() => onChange(nudgeSection(design, section.id, 1))} />
            <ToolButton
                label="Delete section"
                icon={HiOutlineTrash}
                onClick={() => {
                    onChange(removeSection(design, section.id));
                    onSelect({ kind: "theme" });
                }}
            />
        </div>
    );
    return (
        <div
            role="group"
            aria-label={`Section ${index + 1}`}
            tabIndex={0}
            className={`relative ${selected ? "outline outline-2 outline-dashed outline-primary" : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-border"}`}
            style={{ backgroundColor: section.backgroundColor ?? design.theme.contentBackgroundColor, padding: `${section.padding ?? 0}px 0` }}
            onClick={() => onSelect({ kind: "section", id: section.id })}
            onKeyDown={selectOnKey(() => onSelect({ kind: "section", id: section.id }))}
        >
            {tools}
            <div className="flex gap-2">
                {section.columns.map((column) => (
                    <Column key={column.id} column={column} props={props} />
                ))}
            </div>
        </div>
    );
}

/**
 * The email being designed, drawn close to how it will look: sections of columns of blocks. Clicking selects a block or a section
 * (its settings show in the inspector); a text block is edited in place. Blocks move by dragging their handle - within or between
 * columns, by pointer or keyboard (Space, the arrows, Space) - or with their up and down buttons.
 */
export default function Canvas(props: CanvasProps) {
    const { design, onChange } = props;
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    function dragEnd(event: DragEndEvent): void {
        if (event.over) {
            const next: TemplateDesign = dropBlock(design, String(event.active.id), String(event.over.id));
            if (next !== design) {
                onChange(next);
            }
        }
    }

    return (
        <div className="py-8 px-10" style={{ backgroundColor: design.theme.backgroundColor, fontFamily: design.theme.fontFamily }} onClick={() => props.onSelect({ kind: "theme" })}>
            <div className="mx-auto" style={{ maxWidth: design.theme.width }} onClick={(event) => event.stopPropagation()}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
                    {design.sections.map((section, index) => (
                        <Section key={section.id} section={section} index={index} props={props} />
                    ))}
                </DndContext>
                {design.sections.length === 0 && <p className="py-12 text-center text-sm text-text-muted bg-surface">Add a section from the panel on the left to start.</p>}
            </div>
        </div>
    );
}
