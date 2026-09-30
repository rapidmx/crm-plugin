///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useRef } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { IconType } from "react-icons";
import { BsLink45Deg, BsListOl, BsListUl, BsTypeBold, BsTypeItalic, BsTypeStrikethrough, BsTypeUnderline } from "react-icons/bs";
import type { MergeTag } from "../../crmApi.js";
import { isLink } from "./designModel.js";
import MergeTagPicker from "./MergeTagPicker.js";

export interface TextBlockEditorProps {
    /** The text to start with, as HTML. Read once: TipTap owns the document from then on. */
    value: string;
    /** Called with the text as HTML each time it changes. */
    onChange: (html: string) => void;
    /** The merge tags the picker offers. */
    mergeTags: MergeTag[];
}

interface ToolbarButton {
    label: string;
    icon: IconType;
    pressed: boolean;
    onClick: () => void;
}

/**
 * A text block's formatted text, edited where it sits on the canvas: bold, italic, underline, strike-through, lists, links (web, mail,
 * phone or a merge tag such as `{{ links.preferences }}`) and merge tags. Its schema is what the server keeps of a text block, so what
 * is typed here is what is sent.
 */
export default function TextBlockEditor({ value, onChange, mergeTags }: TextBlockEditorProps) {
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const editor: Editor | null = useEditor({
        extensions: [
            StarterKit.configure({
                heading: false,
                code: false,
                codeBlock: false,
                horizontalRule: false,
                trailingNode: false,
                link: {
                    openOnClick: false,
                    autolink: false,
                    isAllowedUri: (url: string) => isLink(url),
                },
            }),
        ],
        content: value,
        immediatelyRender: false,
        editorProps: { attributes: { role: "textbox", "aria-multiline": "true", "aria-label": "Text", class: "outline-none min-h-[2rem]" } },
        onUpdate: ({ editor: updated }) => onChangeRef.current(updated.getHTML()),
    });
    const marks = useEditorState({
        editor,
        selector: ({ editor: current }) => ({
            bold: current?.isActive("bold") ?? false,
            italic: current?.isActive("italic") ?? false,
            underline: current?.isActive("underline") ?? false,
            strike: current?.isActive("strike") ?? false,
            bulletList: current?.isActive("bulletList") ?? false,
            orderedList: current?.isActive("orderedList") ?? false,
            link: current?.isActive("link") ?? false,
        }),
    });

    if (!editor) {
        return null;
    }

    function setLink(): void {
        const current: string = editor!.getAttributes("link").href ?? "";
        const input: string | null = window.prompt("Link address (https://..., mailto:..., or a merge tag such as {{ links.preferences }})", current);
        if (input === null) {
            return;
        }
        if (input.trim() === "") {
            editor!.chain().focus().extendMarkRange("link").unsetLink().run();
        } else if (isLink(input)) {
            editor!.chain().focus().extendMarkRange("link").setLink({ href: input.trim() }).run();
        } else {
            window.alert("That isn't a link an email can use.");
        }
    }

    const buttons: ToolbarButton[] = [
        { label: "Bold", icon: BsTypeBold, pressed: marks!.bold, onClick: () => editor.chain().focus().toggleBold().run() },
        { label: "Italic", icon: BsTypeItalic, pressed: marks!.italic, onClick: () => editor.chain().focus().toggleItalic().run() },
        { label: "Underline", icon: BsTypeUnderline, pressed: marks!.underline, onClick: () => editor.chain().focus().toggleUnderline().run() },
        { label: "Strike-through", icon: BsTypeStrikethrough, pressed: marks!.strike, onClick: () => editor.chain().focus().toggleStrike().run() },
        { label: "Bulleted list", icon: BsListUl, pressed: marks!.bulletList, onClick: () => editor.chain().focus().toggleBulletList().run() },
        { label: "Numbered list", icon: BsListOl, pressed: marks!.orderedList, onClick: () => editor.chain().focus().toggleOrderedList().run() },
        { label: "Link", icon: BsLink45Deg, pressed: marks!.link, onClick: setLink },
    ];

    return (
        <div className="rounded-sm border border-primary">
            <div role="toolbar" aria-label="Text formatting" className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-alt px-1 py-0.5">
                {buttons.map(({ label, icon: Icon, pressed, onClick }) => (
                    <button
                        key={label}
                        type="button"
                        title={label}
                        aria-label={label}
                        aria-pressed={pressed}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={onClick}
                        className={`p-1.5 rounded-sm ${pressed ? "bg-primary-lightest text-primary-dark" : "text-text hover:bg-surface"}`}
                    >
                        <Icon aria-hidden className="w-4 h-4" />
                    </button>
                ))}
                <MergeTagPicker tags={mergeTags} onPick={(tag) => editor.chain().focus().insertContent(`{{ ${tag} }}`).run()} />
            </div>
            <EditorContent editor={editor} className="px-2 py-1 prose-sm" />
        </div>
    );
}
