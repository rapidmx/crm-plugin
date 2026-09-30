///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { CSSProperties } from "react";
import type { DesignBlock, DesignTheme } from "../../crmApi.js";

const HEADING_SIZES: Record<1 | 2 | 3, number> = { 1: 28, 2: 22, 3: 18 };

/**
 * A block drawn on the designer's canvas, close to how the email shows it (the preview shows exactly). Text is the block's saved, sanitized
 * HTML; a hand-written HTML block is shown as its code, since only the sandboxed preview may draw arbitrary HTML.
 */
export default function BlockView({ block, theme }: { block: DesignBlock; theme: DesignTheme }) {
    const box: CSSProperties = { textAlign: block.align, padding: block.padding ?? 8 };
    switch (block.type) {
        case "text":
            return (
                <div
                    style={{ ...box, color: block.color ?? theme.textColor, fontSize: block.fontSize ?? 15, lineHeight: 1.5 }}
                    // The server sanitizes text blocks on save, and the editor's schema only produces what it keeps.
                    dangerouslySetInnerHTML={{ __html: block.html }}
                />
            );
        case "heading":
            return (
                <div role="heading" aria-level={block.level} style={{ ...box, color: block.color ?? theme.textColor, fontSize: HEADING_SIZES[block.level], fontWeight: 700 }}>
                    {block.text}
                </div>
            );
        case "image":
            return (
                <div style={box}>
                    {block.src ? (
                        <img src={block.src} alt={block.alt} style={{ maxWidth: "100%", width: block.width, display: "inline-block" }} />
                    ) : (
                        <div className="border border-dashed border-border py-8 text-center text-sm text-text-muted">Choose an image in the settings</div>
                    )}
                </div>
            );
        case "button":
            return (
                <div style={{ ...box, textAlign: block.align ?? "center" }}>
                    <span
                        style={{
                            display: "inline-block",
                            padding: "10px 25px",
                            background: block.backgroundColor ?? theme.buttonColor,
                            color: block.color ?? theme.buttonTextColor,
                            borderRadius: block.borderRadius ?? 4,
                        }}
                    >
                        {block.text}
                    </span>
                </div>
            );
        case "divider":
            return (
                <div style={{ padding: block.padding ?? 8 }}>
                    <hr style={{ border: 0, borderTop: `${block.thickness ?? 1}px solid ${block.color ?? "#e5e7eb"}` }} />
                </div>
            );
        case "spacer":
            return <div aria-label="Spacer" style={{ height: block.height }} />;
        case "social":
            return (
                <div style={{ ...box, textAlign: block.align ?? "center" }} className="text-sm">
                    {block.links.map((link, index) => (
                        <span key={index} className="inline-block mx-1 px-2 py-0.5 rounded-full bg-surface-alt">
                            {link.network}
                        </span>
                    ))}
                </div>
            );
        case "html":
            return (
                <pre style={box} className="text-xs whitespace-pre-wrap break-all bg-surface-alt text-text-muted max-h-40 overflow-hidden">
                    {block.html}
                </pre>
            );
        default:
            return (
                <div style={{ ...box, textAlign: block.align ?? "center", color: block.color ?? "#6b7280", fontSize: 12 }}>
                    {block.note && <p style={{ margin: "0 0 8px" }}>{block.note}</p>}
                    <p style={{ margin: "0 0 8px" }}>{"{{ workspace.name }} · {{ workspace.postal_address }}"}</p>
                    <p style={{ margin: 0 }}>
                        <u>Unsubscribe</u> · <u>Email preferences</u>
                    </p>
                </div>
            );
    }
}
