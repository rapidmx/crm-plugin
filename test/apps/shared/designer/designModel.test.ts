///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import type { DesignBlock, TemplateDesign } from "../../../../apps/shared/crmApi.js";
import {
    BLOCK_TYPES,
    HISTORY_LIMIT,
    addSection,
    blockLabel,
    designProblems,
    dropBlock,
    duplicateBlock,
    findBlock,
    getBlock,
    insertBlocks,
    isLink,
    moveBlock,
    newBlock,
    newSection,
    nudgeBlock,
    nudgeSection,
    record,
    redo,
    removeBlock,
    removeSection,
    undo,
    updateBlock,
    updateSection,
    withNewIds,
} from "../../../../apps/shared/components/designer/designModel.js";

const theme = { width: 600, backgroundColor: "#eeeeee", contentBackgroundColor: "#ffffff", textColor: "#111111", linkColor: "#0000ff", buttonColor: "#0000ff", buttonTextColor: "#ffffff", fontFamily: "Arial" };
const spacer = (id: string): DesignBlock => ({ id, type: "spacer", height: 10 });

/** Two sections: s1 with columns c1 [a, b] and c2 [c]; s2 with column c3 []. */
function sample(): TemplateDesign {
    return {
        theme,
        sections: [
            { id: "s1", columns: [{ id: "c1", blocks: [spacer("a"), spacer("b")] }, { id: "c2", blocks: [spacer("c")] }] },
            { id: "s2", columns: [{ id: "c3", blocks: [] }] },
        ],
    };
}

const ids = (design: TemplateDesign) => design.sections.map((section) => section.columns.map((column) => column.blocks.map((block) => block.id)));

describe("designModel", () => {
    it("makes a new block of every type, with labels", () => {
        for (const { type, label } of BLOCK_TYPES) {
            const block = newBlock(type);
            expect(block.type).toBe(type);
            expect(block.id).toMatch(/^[0-9a-f-]{36}$/);
            expect(blockLabel(type)).toBe(label);
        }
        expect(newSection(3).columns).toHaveLength(3);
        const [copy] = withNewIds([spacer("a")]);
        expect(copy).toMatchObject({ type: "spacer", height: 10 });
        expect(copy.id).not.toBe("a");
    });

    it("finds, changes, removes, inserts and duplicates blocks", () => {
        const design = sample();
        expect(findBlock(design, "c")).toEqual({ section: 0, column: 1, index: 0 });
        expect(findBlock(design, "zz")).toBeUndefined();
        expect(getBlock(design, "zz")).toBeUndefined();
        expect(getBlock(updateBlock(design, "b", { height: 99 }), "b")).toMatchObject({ height: 99 });
        expect(ids(removeBlock(design, "a"))).toEqual([[["b"], ["c"]], [[]]]);
        expect(ids(insertBlocks(design, "c3", 0, [spacer("n")]))).toEqual([[["a", "b"], ["c"]], [["n"]]]);
        const copied = duplicateBlock(design, "a");
        expect(ids(copied.design)[0][0]).toEqual(["a", copied.id, "b"]);
        expect(ids(design)).toEqual([[["a", "b"], ["c"]], [[]]]);
    });

    it("moves blocks by nudging and dragging", () => {
        const design = sample();
        expect(ids(moveBlock(design, "a", "c2", 1))).toEqual([[["b"], ["c", "a"]], [[]]]);
        expect(moveBlock(design, "zz", "c2", 0)).toBe(design);
        expect(ids(nudgeBlock(design, "b", -1))[0][0]).toEqual(["b", "a"]);
        expect(nudgeBlock(design, "a", -1)).toBe(design);
        expect(nudgeBlock(design, "b", 1)).toBe(design);

        expect(ids(dropBlock(design, "a", "b"))[0][0]).toEqual(["b", "a"]);
        expect(ids(dropBlock(design, "a", "c"))[0]).toEqual([["b"], ["a", "c"]]);
        expect(ids(dropBlock(design, "a", "c3"))).toEqual([[["b"], ["c"]], [["a"]]]);
        expect(ids(dropBlock(design, "a", "c1"))[0][0]).toEqual(["b", "a"]);
        expect(dropBlock(design, "a", "a")).toBe(design);
        expect(dropBlock(design, "zz", "a")).toBe(design);
        expect(dropBlock(design, "a", "nowhere")).toBe(design);
    });

    it("adds, removes, moves and changes sections, keeping blocks when columns go", () => {
        const design = sample();
        expect(addSection(design, 1, { id: "s3", columns: [] }).sections.map((section) => section.id)).toEqual(["s1", "s3", "s2"]);
        expect(removeSection(design, "s1").sections.map((section) => section.id)).toEqual(["s2"]);
        expect(nudgeSection(design, "s2", -1).sections.map((section) => section.id)).toEqual(["s2", "s1"]);
        expect(nudgeSection(design, "s1", -1)).toBe(design);
        expect(nudgeSection(design, "s2", 1)).toBe(design);

        expect(ids(updateSection(design, "s1", { columns: 1 }))[0]).toEqual([["a", "b", "c"]]);
        expect(ids(updateSection(design, "s2", { columns: 3 }))[1]).toEqual([[], [], []]);
        const styled = updateSection(design, "s1", { backgroundColor: "#ff0000", padding: 4, columns: 2 });
        expect(styled.sections[0]).toMatchObject({ backgroundColor: "#ff0000", padding: 4 });
        expect(ids(styled)[0]).toEqual([["a", "b"], ["c"]]);
    });

    it("finds what would stop a design being saved", () => {
        const design: TemplateDesign = {
            theme,
            sections: [
                {
                    id: "s",
                    columns: [
                        {
                            id: "c",
                            blocks: [
                                { id: "i", type: "image", src: "http://x", alt: "" },
                                { id: "b", type: "button", text: "Go", href: "" },
                                { id: "o", type: "social", links: [{ network: "x", href: "https://x.com/a" }, { network: "web", href: "nope" }] },
                                { id: "h", type: "heading", text: " ", level: 1 },
                                { id: "ok", type: "button", text: "Go", href: "{{ links.preferences }}" },
                            ],
                        },
                    ],
                },
            ],
        };
        expect(designProblems(design)).toEqual([
            { blockId: "i", message: "An image needs an https:// address." },
            { blockId: "b", message: 'The button "Go" needs a link.' },
            { blockId: "o", message: "Every social link needs an address." },
            { blockId: "h", message: "A heading needs some text." },
        ]);
        expect(isLink("mailto:a@x")).toBe(true);
        expect(isLink("tel:1")).toBe(true);
        expect(isLink("javascript:x")).toBe(false);
    });

    it("undoes and redoes, forgetting the redo trail on a new change and old designs past the limit", () => {
        const a = sample();
        const b = removeBlock(a, "a");
        const c = removeBlock(b, "b");
        let history = record(record({ past: [], present: a, future: [] }, b), c);
        expect(undo({ past: [], present: a, future: [] })).toEqual({ past: [], present: a, future: [] });
        expect(redo(history)).toBe(history);
        history = undo(undo(history));
        expect(history.present).toBe(a);
        history = redo(history);
        expect(history.present).toBe(b);
        expect(history.future).toEqual([c]);
        expect(record(history, a).future).toEqual([]);

        let long = { past: [], present: a, future: [] } as ReturnType<typeof record>;
        for (let count = 0; count < HISTORY_LIMIT + 5; count++) {
            long = record(long, a);
        }
        expect(long.past).toHaveLength(HISTORY_LIMIT);
    });
});
