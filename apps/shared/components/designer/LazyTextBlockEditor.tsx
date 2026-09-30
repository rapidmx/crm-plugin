///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { ComponentType, useEffect, useState } from "react";
import type { TextBlockEditorProps } from "./TextBlockEditor.js";

let loading: Promise<ComponentType<TextBlockEditorProps>> | undefined;
let loaded: ComponentType<TextBlockEditorProps> | undefined;

/** Fetches the editor's chunk once. A failed download is forgotten, so asking again tries again. */
function loadEditor(): Promise<ComponentType<TextBlockEditorProps>> {
    loading ??= import("./TextBlockEditor.js").then(
        (module) => (loaded = module.default),
        (err: unknown) => {
            loading = undefined;
            throw err;
        },
    );
    return loading;
}

/**
 * `TextBlockEditor`, loaded when a text block is first edited - TipTap and ProseMirror are a good deal of code the designer doesn't need
 * until then, and they can't run on the server. A chunk that fails to download says so, with a retry.
 */
export default function LazyTextBlockEditor(props: TextBlockEditorProps) {
    const [Editor, setEditor] = useState<ComponentType<TextBlockEditorProps> | null>(() => loaded ?? null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let current = true;
        loadEditor().then(
            (component) => current && setEditor(() => component),
            () => current && setFailed(true),
        );
        return () => {
            current = false;
        };
    }, [attempt]);

    if (Editor) {
        return <Editor {...props} />;
    }
    if (failed) {
        return (
            <p role="alert" className="text-sm text-danger">
                The text editor couldn&rsquo;t be loaded.{" "}
                <button
                    type="button"
                    className="underline"
                    onClick={() => {
                        setFailed(false);
                        setAttempt((count) => count + 1);
                    }}
                >
                    Try again
                </button>
            </p>
        );
    }
    return (
        <div aria-busy="true" className="min-h-[3rem] rounded-sm border border-border bg-surface-alt text-sm text-text-muted px-2 py-1">
            Loading the editor&hellip;
        </div>
    );
}
