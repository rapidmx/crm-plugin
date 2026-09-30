// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// The text block editor with a real TipTap editor, and its lazy loader.
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import TextBlockEditor, { type TextBlockEditorProps } from "../../../../apps/shared/components/designer/TextBlockEditor.js";

beforeAll(() => {
    // jsdom has no layout: ProseMirror measures a Range when it scrolls the caret into view.
    const noRects = { length: 0, item: () => null, [Symbol.iterator]: () => [][Symbol.iterator]() };
    Range.prototype.getClientRects = () => noRects;
    Range.prototype.getBoundingClientRect = () => new DOMRect();
});

afterEach(() => {
    vi.restoreAllMocks();
});

async function renderEditor(value: string) {
    const onChange = vi.fn();
    const { container } = render(<TextBlockEditor value={value} onChange={onChange} mergeTags={[{ tag: "contact.first_name", label: "First name" }]} />);
    const editor: Editor = await waitFor(() => {
        const found: { editor?: Editor } | null = container.querySelector(".ProseMirror");
        expect(found?.editor).toBeDefined();
        return found!.editor!;
    });
    return { editor, onChange };
}

const button = (name: string) => screen.getByRole("button", { name });

describe("TextBlockEditor", () => {
    it("formats the selection with each toolbar button, and reports the HTML", async () => {
        const { editor, onChange } = await renderEditor("<p>Hello world</p>");
        act(() => {
            editor.commands.selectAll();
        });
        for (const name of ["Bold", "Italic", "Underline", "Strike-through"]) {
            fireEvent.mouseDown(button(name));
            fireEvent.click(button(name));
            await waitFor(() => expect(button(name)).toHaveAttribute("aria-pressed", "true"));
        }
        expect(onChange).toHaveBeenLastCalledWith("<p><strong><em><s><u>Hello world</u></s></em></strong></p>");
        fireEvent.click(button("Bulleted list"));
        await waitFor(() => expect(button("Bulleted list")).toHaveAttribute("aria-pressed", "true"));
        fireEvent.click(button("Numbered list"));
        await waitFor(() => expect(button("Numbered list")).toHaveAttribute("aria-pressed", "true"));
        expect(onChange.mock.lastCall![0]).toMatch(/^<ol><li><p>/);
    });

    it("inserts merge tags", async () => {
        const { onChange } = await renderEditor("<p>Hi </p>");
        await userEvent.selectOptions(screen.getByLabelText("Insert merge tag"), "contact.first_name");
        expect(onChange.mock.lastCall![0]).toContain("{{ contact.first_name }}");
    });

    it("sets, keeps and removes links, refusing unsafe ones", async () => {
        const { editor, onChange } = await renderEditor('<p>Read <a href="{{ links.preferences }}">prefs</a> now</p>');
        expect(editor.getHTML()).toContain('href="{{ links.preferences }}"');
        act(() => {
            editor.commands.setTextSelection({ from: 1, to: 5 });
        });
        const prompt = vi.spyOn(window, "prompt");
        const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);

        prompt.mockReturnValueOnce(null);
        fireEvent.click(button("Link"));
        expect(onChange).not.toHaveBeenCalled();

        prompt.mockReturnValueOnce("javascript:alert(1)");
        fireEvent.click(button("Link"));
        expect(alert).toHaveBeenCalled();

        prompt.mockReturnValueOnce(" https://acme.example ");
        fireEvent.click(button("Link"));
        expect(onChange.mock.lastCall![0]).toContain('<a target="_blank" rel="noopener noreferrer nofollow" href="https://acme.example">Read</a>');

        prompt.mockReturnValueOnce("");
        fireEvent.click(button("Link"));
        expect(prompt).toHaveBeenLastCalledWith(expect.any(String), "https://acme.example");
        expect(onChange.mock.lastCall![0]).not.toContain("acme.example");
    });
});

describe("LazyTextBlockEditor", () => {
    const MODULE = "../../../../apps/shared/components/designer/TextBlockEditor.js";
    const props: TextBlockEditorProps = { value: "<p>hi</p>", onChange: vi.fn(), mergeTags: [] };
    const Stub = ({ value }: TextBlockEditorProps) => <div data-testid="editor">{value}</div>;
    const fresh = async () => (await import("../../../../apps/shared/components/designer/LazyTextBlockEditor.js")).default;

    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.doUnmock(MODULE);
    });

    it("shows a placeholder, then the editor, and draws it at once the next time", async () => {
        const factory = vi.fn(() => ({ default: Stub }));
        vi.doMock(MODULE, factory);
        const Lazy = await fresh();
        const first = render(<Lazy {...props} />);
        expect(screen.getByText("Loading the editor…")).toBeInTheDocument();
        expect(await screen.findByTestId("editor")).toHaveTextContent("<p>hi</p>");
        first.unmount();
        render(<Lazy {...props} />);
        expect(screen.getByTestId("editor")).toBeInTheDocument();
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it("says the editor could not be loaded, and tries again", async () => {
        vi.doMock(MODULE, () => {
            throw new Error("offline");
        });
        const Lazy = await fresh();
        render(<Lazy {...props} />);
        expect(await screen.findByRole("alert")).toHaveTextContent("The text editor couldn’t be loaded.");
        vi.doMock(MODULE, () => ({ default: Stub }));
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByTestId("editor")).toBeInTheDocument();
    });

    it("ignores a load or failure that finishes after it is gone", async () => {
        let settle: (module: unknown) => void = () => undefined;
        const pending = new Promise((resolve) => (settle = resolve));
        vi.doMock(MODULE, () => pending);
        let Lazy = await fresh();
        render(<Lazy {...props} />).unmount();
        settle({ default: Stub });
        await pending;

        vi.resetModules();
        let fail: (error: Error) => void = () => undefined;
        const failing = new Promise((_resolve, reject) => (fail = reject));
        failing.catch(() => undefined);
        vi.doMock(MODULE, () => failing);
        Lazy = await fresh();
        render(<Lazy {...props} />).unmount();
        fail(new Error("offline"));
        await failing.catch(() => undefined);
    });
});
