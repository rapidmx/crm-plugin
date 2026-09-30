///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * The template designer's edits, as pure functions over a `TemplateDesign`: each returns a new design and leaves the one it was given
 * alone, so the designer can keep every earlier design for undo.
 */
import type { BlockType, DesignBlock, DesignColumn, DesignSection, TemplateDesign } from "../../crmApi.js";

/** A fresh id for a section, column or block. */
export function newId(): string {
    return crypto.randomUUID();
}

/** The block types the palette offers, in its order, with what each is called. */
export const BLOCK_TYPES: { type: BlockType; label: string }[] = [
    { type: "heading", label: "Heading" },
    { type: "text", label: "Text" },
    { type: "image", label: "Image" },
    { type: "button", label: "Button" },
    { type: "divider", label: "Divider" },
    { type: "spacer", label: "Spacer" },
    { type: "social", label: "Social links" },
    { type: "footer", label: "Footer" },
    { type: "html", label: "HTML" },
];

/** What a block type is called. */
export function blockLabel(type: BlockType): string {
    return BLOCK_TYPES.find((entry) => entry.type === type)!.label;
}

/** A new block of `type`, with the content a new one starts with. */
export function newBlock(type: BlockType): DesignBlock {
    const id: string = newId();
    switch (type) {
        case "heading":
            return { id, type, text: "New heading", level: 2 };
        case "text":
            return { id, type, html: "<p>Write something here.</p>" };
        case "image":
            return { id, type, src: "", alt: "" };
        case "button":
            return { id, type, text: "Click here", href: "" };
        case "divider":
            return { id, type };
        case "spacer":
            return { id, type, height: 24 };
        case "social":
            return { id, type, links: [{ network: "web", href: "" }], align: "center" };
        case "html":
            return { id, type, html: "<p>Your HTML</p>" };
        default:
            return { id, type: "footer" };
    }
}

/** A new section with `columns` empty columns (1 to 4). */
export function newSection(columns: number): DesignSection {
    return { id: newId(), padding: 16, columns: Array.from({ length: columns }, () => ({ id: newId(), blocks: [] })) };
}

/** `blocks` with fresh ids, for pasting a saved block or duplicating one. */
export function withNewIds(blocks: DesignBlock[]): DesignBlock[] {
    return blocks.map((block) => ({ ...structuredClone(block), id: newId() }));
}

/** Where a block is. */
export interface BlockLocation {
    section: number;
    column: number;
    index: number;
}

/** Where block `id` is, or `undefined`. */
export function findBlock(design: TemplateDesign, id: string): BlockLocation | undefined {
    for (const [section, { columns }] of design.sections.entries()) {
        for (const [column, { blocks }] of columns.entries()) {
            const index: number = blocks.findIndex((block) => block.id === id);
            if (index >= 0) {
                return { section, column, index };
            }
        }
    }
    return undefined;
}

/** The block `id`, or `undefined`. */
export function getBlock(design: TemplateDesign, id: string): DesignBlock | undefined {
    const at: BlockLocation | undefined = findBlock(design, id);
    return at && design.sections[at.section].columns[at.column].blocks[at.index];
}

/** Where column `id` is: its section's index and its own. */
function findColumn(design: TemplateDesign, id: string): { section: number; column: number } | undefined {
    for (const [section, { columns }] of design.sections.entries()) {
        const column: number = columns.findIndex((entry) => entry.id === id);
        if (column >= 0) {
            return { section, column };
        }
    }
    return undefined;
}

/** `design` with the blocks of each column passed through `change` (given the column's id). */
function mapColumns(design: TemplateDesign, change: (column: DesignColumn) => DesignBlock[]): TemplateDesign {
    return {
        ...design,
        sections: design.sections.map((section) => ({ ...section, columns: section.columns.map((column) => ({ ...column, blocks: change(column) })) })),
    };
}

/** `design` with block `id` changed by `patch`. */
export function updateBlock(design: TemplateDesign, id: string, patch: Partial<DesignBlock>): TemplateDesign {
    return mapColumns(design, ({ blocks }) => blocks.map((block) => (block.id === id ? ({ ...block, ...patch } as DesignBlock) : block)));
}

/** `design` without block `id`. */
export function removeBlock(design: TemplateDesign, id: string): TemplateDesign {
    return mapColumns(design, ({ blocks }) => blocks.filter((block) => block.id !== id));
}

/** `design` with `blocks` put into column `columnId` at `index` (its end when past it). */
export function insertBlocks(design: TemplateDesign, columnId: string, index: number, blocks: DesignBlock[]): TemplateDesign {
    return mapColumns(design, (column) => (column.id === columnId ? [...column.blocks.slice(0, index), ...blocks, ...column.blocks.slice(index)] : column.blocks));
}

/** `design` with a copy of block `id` right after it; the copy's id is returned too. */
export function duplicateBlock(design: TemplateDesign, id: string): { design: TemplateDesign; id: string } {
    const at: BlockLocation = findBlock(design, id)!;
    const column: DesignColumn = design.sections[at.section].columns[at.column];
    const [copy] = withNewIds([column.blocks[at.index]]);
    return { design: insertBlocks(design, column.id, at.index + 1, [copy]), id: copy.id };
}

/** `design` with block `id` moved to column `columnId` at `index` (counted without the block). */
export function moveBlock(design: TemplateDesign, id: string, columnId: string, index: number): TemplateDesign {
    const block: DesignBlock | undefined = getBlock(design, id);
    return block ? insertBlocks(removeBlock(design, id), columnId, index, [block]) : design;
}

/** `design` with block `id` one place up (`delta` -1) or down (1) its column; unchanged at the column's end. */
export function nudgeBlock(design: TemplateDesign, id: string, delta: -1 | 1): TemplateDesign {
    const at: BlockLocation = findBlock(design, id)!;
    const column: DesignColumn = design.sections[at.section].columns[at.column];
    const index: number = at.index + delta;
    return index < 0 || index >= column.blocks.length ? design : moveBlock(design, id, column.id, index);
}

/**
 * `design` after dragging block `activeId` over `overId` - another block (it takes that block's place) or a column (it goes to the column's
 * end, which is how an empty column is dropped into). Unchanged when either is unknown.
 */
export function dropBlock(design: TemplateDesign, activeId: string, overId: string): TemplateDesign {
    const from: BlockLocation | undefined = findBlock(design, activeId);
    if (!from || activeId === overId) {
        return design;
    }
    const overBlock: BlockLocation | undefined = findBlock(design, overId);
    if (overBlock) {
        const columnId: string = design.sections[overBlock.section].columns[overBlock.column].id;
        return moveBlock(design, activeId, columnId, overBlock.index);
    }
    const overColumn = findColumn(design, overId);
    if (!overColumn) {
        return design;
    }
    const column: DesignColumn = design.sections[overColumn.section].columns[overColumn.column];
    const sameColumn: boolean = from.section === overColumn.section && from.column === overColumn.column;
    return moveBlock(design, activeId, column.id, column.blocks.length - (sameColumn ? 1 : 0));
}

/** `design` with `section` put at `index`. */
export function addSection(design: TemplateDesign, index: number, section: DesignSection): TemplateDesign {
    return { ...design, sections: [...design.sections.slice(0, index), section, ...design.sections.slice(index)] };
}

/** `design` without section `id`. */
export function removeSection(design: TemplateDesign, id: string): TemplateDesign {
    return { ...design, sections: design.sections.filter((section) => section.id !== id) };
}

/** `design` with section `id` one place up (-1) or down (1); unchanged at either end. */
export function nudgeSection(design: TemplateDesign, id: string, delta: -1 | 1): TemplateDesign {
    const from: number = design.sections.findIndex((section) => section.id === id);
    const to: number = from + delta;
    if (to < 0 || to >= design.sections.length) {
        return design;
    }
    const sections: DesignSection[] = [...design.sections];
    [sections[from], sections[to]] = [sections[to], sections[from]];
    return { ...design, sections };
}

/**
 * `design` with section `id` changed by `patch`; a `columns` count (1 to 4) adds empty columns or folds the blocks of removed ones into
 * the last one kept, so no block is lost.
 */
export function updateSection(design: TemplateDesign, id: string, patch: { backgroundColor?: string; padding?: number; columns?: number }): TemplateDesign {
    const { columns: count, ...rest } = patch;
    return {
        ...design,
        sections: design.sections.map((section) => {
            if (section.id !== id) {
                return section;
            }
            let columns: DesignColumn[] = section.columns;
            if (count !== undefined && count > columns.length) {
                columns = [...columns, ...Array.from({ length: count - columns.length }, () => ({ id: newId(), blocks: [] }))];
            } else if (count !== undefined && count < columns.length) {
                const folded: DesignBlock[] = columns.slice(count - 1).flatMap((column) => column.blocks);
                columns = [...columns.slice(0, count - 1), { ...columns[count - 1], blocks: folded }];
            }
            return { ...section, ...rest, columns };
        }),
    };
}

/** What stops a design being saved, block by block - fields the server would refuse. */
export function designProblems(design: TemplateDesign): { blockId: string; message: string }[] {
    const problems: { blockId: string; message: string }[] = [];
    for (const { columns } of design.sections) {
        for (const { blocks } of columns) {
            for (const block of blocks) {
                const add = (message: string) => problems.push({ blockId: block.id, message });
                if (block.type === "image" && !/^https:\/\//i.test(block.src)) {
                    add("An image needs an https:// address.");
                } else if (block.type === "button" && !isLink(block.href)) {
                    add(`The button "${block.text}" needs a link.`);
                } else if (block.type === "social" && block.links.some((link) => !isLink(link.href))) {
                    add("Every social link needs an address.");
                } else if (block.type === "heading" && block.text.trim() === "") {
                    add("A heading needs some text.");
                }
            }
        }
    }
    return problems;
}

/** Whether `href` is a link the server takes: web, mail or phone, or starting with a merge tag. */
export function isLink(href: string): boolean {
    return /^(?:https?:\/\/\S|mailto:\S|tel:\S|\{\{)/i.test(href.trim());
}

/** Undo history: the designs before the current one, the current one, and those undone. */
export interface History {
    past: TemplateDesign[];
    present: TemplateDesign;
    future: TemplateDesign[];
}

/** How many designs back undo reaches. */
export const HISTORY_LIMIT = 100;

/** `history` with `design` as the current design (dropping what was undone). */
export function record(history: History, design: TemplateDesign): History {
    return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: design, future: [] };
}

/** `history` one step back; unchanged when there's nothing to undo. */
export function undo(history: History): History {
    if (history.past.length === 0) {
        return history;
    }
    return { past: history.past.slice(0, -1), present: history.past[history.past.length - 1], future: [history.present, ...history.future] };
}

/** `history` one step forward again; unchanged when nothing was undone. */
export function redo(history: History): History {
    if (history.future.length === 0) {
        return history;
    }
    return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) };
}
