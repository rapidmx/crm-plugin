///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { ReactNode, useEffect, useId, useState } from "react";
import type { Align, DesignBlock, DesignSection, DesignTheme, MergeTag, SocialNetwork } from "../../crmApi.js";
import { INPUT_CLASS } from "../CrmShell.js";
import { blockLabel } from "./designModel.js";
import MergeTagPicker from "./MergeTagPicker.js";

const NETWORKS: SocialNetwork[] = ["facebook", "x", "linkedin", "instagram", "youtube", "github", "web"];

/** One labelled setting. */
function Field({ label, children, extra }: { label: string; children: (id: string) => ReactNode; extra?: ReactNode }) {
    const id: string = useId();
    return (
        <div className="mb-3">
            <div className="flex items-center justify-between gap-2 mb-1">
                <label htmlFor={id} className="text-xs font-semibold text-text-muted">
                    {label}
                </label>
                {extra}
            </div>
            {children(id)}
        </div>
    );
}

function TextSetting({ label, value, onChange, mergeTags, multiline }: { label: string; value: string; onChange: (value: string) => void; mergeTags?: MergeTag[]; multiline?: boolean }) {
    return (
        <Field label={label} extra={mergeTags && <MergeTagPicker tags={mergeTags} label={`Insert merge tag into ${label.toLowerCase()}`} onPick={(tag) => onChange(`${value}{{ ${tag} }}`)} />}>
            {(id) =>
                multiline ? (
                    <textarea id={id} className={`${INPUT_CLASS} font-mono text-xs`} rows={10} value={value} onChange={(event) => onChange(event.target.value)} />
                ) : (
                    <input id={id} className={INPUT_CLASS} value={value} onChange={(event) => onChange(event.target.value)} />
                )
            }
        </Field>
    );
}

/**
 * A number setting. What's typed is kept as typed, and passed on once it's a whole number in range; emptying it clears the setting
 * (`undefined`, the default). Leaving the field shows the setting again.
 */
function NumberSetting({ label, value, onChange, min, max }: { label: string; value: number | undefined; onChange: (value: number | undefined) => void; min: number; max: number }) {
    const shown: string = value === undefined ? "" : String(value);
    const [text, setText] = useState(shown);
    useEffect(() => {
        // The setting changed elsewhere (undo, say): show it, unless it's what's being typed.
        setText((current) => (current === "" ? undefined : Number(current)) === value ? current : shown);
    }, [value]);
    return (
        <Field label={label}>
            {(id) => (
                <input
                    id={id}
                    type="number"
                    min={min}
                    max={max}
                    className={INPUT_CLASS}
                    value={text}
                    onBlur={() => setText(shown)}
                    onChange={(event) => {
                        const raw: string = event.target.value;
                        setText(raw);
                        const parsed: number = Number(raw);
                        if (raw === "") {
                            onChange(undefined);
                        } else if (Number.isInteger(parsed) && parsed >= min && parsed <= max) {
                            onChange(parsed);
                        }
                    }}
                />
            )}
        </Field>
    );
}

/** A colour setting: a picker, plus a button back to the default unless `required`. */
function ColorSetting({
    label,
    value,
    onChange,
    fallback,
    required,
}: {
    label: string;
    value: string | undefined;
    onChange: (value: string | undefined) => void;
    fallback: string;
    required?: boolean;
}) {
    return (
        <Field
            label={label}
            extra={
                !required &&
                value !== undefined && (
                    <button type="button" className="text-xs text-primary-dark hover:underline" onClick={() => onChange(undefined)}>
                        Default
                    </button>
                )
            }
        >
            {(id) => <input id={id} type="color" className="h-8 w-16 border border-border rounded-sm" value={value ?? fallback} onChange={(event) => onChange(event.target.value)} />}
        </Field>
    );
}

function AlignSetting({ value, onChange }: { value: Align | undefined; onChange: (value: Align | undefined) => void }) {
    return (
        <Field label="Alignment">
            {(id) => (
                <select id={id} className={INPUT_CLASS} value={value ?? ""} onChange={(event) => onChange((event.target.value || undefined) as Align | undefined)}>
                    <option value="">Default</option>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                </select>
            )}
        </Field>
    );
}

export interface BlockInspectorProps {
    block: DesignBlock;
    theme: DesignTheme;
    mergeTags: MergeTag[];
    /** The caller may write hand-written HTML (workspace admins). */
    canManage: boolean;
    onChange: (patch: Partial<DesignBlock>) => void;
}

/** The settings of the selected block. */
export function BlockInspector({ block, theme, mergeTags, canManage, onChange }: BlockInspectorProps) {
    const set = (patch: Record<string, unknown>) => onChange(patch);
    const common = (
        <>
            {block.type !== "spacer" && block.type !== "divider" && <AlignSetting value={block.align} onChange={(align) => set({ align })} />}
            {block.type !== "spacer" && <NumberSetting label="Padding (px)" value={block.padding} min={0} max={80} onChange={(padding) => set({ padding })} />}
        </>
    );
    let fields: ReactNode;
    switch (block.type) {
        case "text":
            fields = (
                <>
                    <p className="text-xs text-text-muted mb-3">Edit the text on the canvas.</p>
                    <NumberSetting label="Font size (px)" value={block.fontSize} min={10} max={48} onChange={(fontSize) => set({ fontSize })} />
                    <ColorSetting label="Text colour" value={block.color} fallback={theme.textColor} onChange={(color) => set({ color })} />
                </>
            );
            break;
        case "heading":
            fields = (
                <>
                    <TextSetting label="Heading" value={block.text} mergeTags={mergeTags} onChange={(text) => set({ text })} />
                    <Field label="Size">
                        {(id) => (
                            <select id={id} className={INPUT_CLASS} value={block.level} onChange={(event) => set({ level: Number(event.target.value) })}>
                                <option value={1}>Large</option>
                                <option value={2}>Medium</option>
                                <option value={3}>Small</option>
                            </select>
                        )}
                    </Field>
                    <ColorSetting label="Colour" value={block.color} fallback={theme.textColor} onChange={(color) => set({ color })} />
                </>
            );
            break;
        case "image":
            fields = (
                <>
                    <TextSetting label="Image address (https://)" value={block.src} onChange={(src) => set({ src })} />
                    <TextSetting label="Description (alt text)" value={block.alt} onChange={(alt) => set({ alt })} />
                    <TextSetting label="Link (optional)" value={block.href ?? ""} mergeTags={mergeTags} onChange={(href) => set({ href: href || undefined })} />
                    <NumberSetting label="Width (px)" value={block.width} min={16} max={theme.width} onChange={(width) => set({ width })} />
                </>
            );
            break;
        case "button":
            fields = (
                <>
                    <TextSetting label="Label" value={block.text} mergeTags={mergeTags} onChange={(text) => set({ text })} />
                    <TextSetting label="Link" value={block.href} mergeTags={mergeTags} onChange={(href) => set({ href })} />
                    <ColorSetting label="Button colour" value={block.backgroundColor} fallback={theme.buttonColor} onChange={(backgroundColor) => set({ backgroundColor })} />
                    <ColorSetting label="Label colour" value={block.color} fallback={theme.buttonTextColor} onChange={(color) => set({ color })} />
                    <NumberSetting label="Corner radius (px)" value={block.borderRadius} min={0} max={40} onChange={(borderRadius) => set({ borderRadius })} />
                </>
            );
            break;
        case "divider":
            fields = (
                <>
                    <ColorSetting label="Colour" value={block.color} fallback="#e5e7eb" onChange={(color) => set({ color })} />
                    <NumberSetting label="Thickness (px)" value={block.thickness} min={1} max={10} onChange={(thickness) => set({ thickness })} />
                </>
            );
            break;
        case "spacer":
            fields = <NumberSetting label="Height (px)" value={block.height} min={1} max={200} onChange={(height) => set({ height: height ?? 24 })} />;
            break;
        case "social":
            fields = (
                <fieldset className="mb-3">
                    <legend className="text-xs font-semibold text-text-muted mb-1">Links</legend>
                    {block.links.map((link, index) => (
                        <div key={index} className="flex gap-1 mb-1">
                            <select
                                aria-label={`Network ${index + 1}`}
                                className={`${INPUT_CLASS} !w-28`}
                                value={link.network}
                                onChange={(event) => set({ links: block.links.map((entry, at) => (at === index ? { ...entry, network: event.target.value } : entry)) })}
                            >
                                {NETWORKS.map((network) => (
                                    <option key={network} value={network}>
                                        {network}
                                    </option>
                                ))}
                            </select>
                            <input
                                aria-label={`Address ${index + 1}`}
                                className={INPUT_CLASS}
                                value={link.href}
                                placeholder="https://"
                                onChange={(event) => set({ links: block.links.map((entry, at) => (at === index ? { ...entry, href: event.target.value } : entry)) })}
                            />
                            <button
                                type="button"
                                aria-label={`Remove link ${index + 1}`}
                                disabled={block.links.length === 1}
                                className="px-2 text-danger disabled:opacity-40"
                                onClick={() => set({ links: block.links.filter((_entry, at) => at !== index) })}
                            >
                                &times;
                            </button>
                        </div>
                    ))}
                    {block.links.length < 10 && (
                        <button type="button" className="text-xs text-primary-dark hover:underline" onClick={() => set({ links: [...block.links, { network: "web", href: "" }] })}>
                            + Add link
                        </button>
                    )}
                </fieldset>
            );
            break;
        case "html":
            fields = canManage ? (
                <>
                    <TextSetting label="HTML" value={block.html} multiline mergeTags={mergeTags} onChange={(html) => set({ html })} />
                    <p className="text-xs text-text-muted mb-3">Scripts, forms and frames are removed when you save.</p>
                </>
            ) : (
                <p className="text-xs text-text-muted mb-3">Only workspace admins can change HTML blocks.</p>
            );
            break;
        default:
            fields = (
                <>
                    <TextSetting label="Note (why they get this email)" value={block.note ?? ""} onChange={(note) => set({ note: note || undefined })} />
                    <ColorSetting label="Text colour" value={block.color} fallback="#6b7280" onChange={(color) => set({ color })} />
                    <p className="text-xs text-text-muted mb-3">The footer always shows your workspace&apos;s name and postal address, and the unsubscribe and preferences links.</p>
                </>
            );
    }
    return (
        <div>
            <h2 className="text-sm font-semibold mb-3">{blockLabel(block.type)}</h2>
            {fields}
            {common}
        </div>
    );
}

/** The settings of the selected section. */
export function SectionInspector({
    section,
    theme,
    onChange,
}: {
    section: DesignSection;
    theme: DesignTheme;
    onChange: (patch: { backgroundColor?: string; padding?: number; columns?: number }) => void;
}) {
    return (
        <div>
            <h2 className="text-sm font-semibold mb-3">Section</h2>
            <Field label="Columns">
                {(id) => (
                    <select id={id} className={INPUT_CLASS} value={section.columns.length} onChange={(event) => onChange({ columns: Number(event.target.value) })}>
                        {[1, 2, 3, 4].map((count) => (
                            <option key={count} value={count}>
                                {count}
                            </option>
                        ))}
                    </select>
                )}
            </Field>
            <ColorSetting label="Background" value={section.backgroundColor} fallback={theme.contentBackgroundColor} onChange={(backgroundColor) => onChange({ backgroundColor })} />
            <NumberSetting label="Padding (px)" value={section.padding} min={0} max={80} onChange={(padding) => onChange({ padding })} />
        </div>
    );
}

/** The design's overall look. */
export function ThemeInspector({ theme, onChange }: { theme: DesignTheme; onChange: (patch: Partial<DesignTheme>) => void }) {
    const colors: [keyof DesignTheme, string][] = [
        ["backgroundColor", "Page background"],
        ["contentBackgroundColor", "Content background"],
        ["textColor", "Text"],
        ["linkColor", "Links"],
        ["buttonColor", "Buttons"],
        ["buttonTextColor", "Button labels"],
    ];
    return (
        <div>
            <h2 className="text-sm font-semibold mb-3">Theme</h2>
            <Field label="Font">
                {(id) => (
                    <select id={id} className={INPUT_CLASS} value={theme.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value })}>
                        {[theme.fontFamily, "Arial, Helvetica, sans-serif", "Georgia, 'Times New Roman', serif", "Verdana, Geneva, sans-serif", "'Trebuchet MS', Helvetica, sans-serif", "'Courier New', monospace"]
                            .filter((font, index, all) => all.indexOf(font) === index)
                            .map((font) => (
                                <option key={font} value={font}>
                                    {font.split(",")[0].replace(/'/g, "")}
                                </option>
                            ))}
                    </select>
                )}
            </Field>
            <NumberSetting label="Width (px)" value={theme.width} min={480} max={800} onChange={(width) => onChange({ width: width ?? 600 })} />
            {colors.map(([key, label]) => (
                <ColorSetting key={key} label={label} required value={theme[key] as string} fallback={theme[key] as string} onChange={(value) => onChange({ [key]: value })} />
            ))}
        </div>
    );
}
