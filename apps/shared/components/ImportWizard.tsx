///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import { CrmImport, CrmObjectType, ImportColumnMapping, ImportUpload, deleteImport, errorMessage, listImports, startImport, uploadImport } from "../crmApi.js";
import { INPUT_CLASS, useCrm } from "./CrmShell.js";

/** How often the import list is refreshed while an import is queued or running, in milliseconds. */
export const IMPORT_POLL_MS = 3000;

/** A readable name for an import target. */
function targetLabel(target: string): string {
    return target.startsWith("properties.") ? `${target.slice("properties.".length)} (custom)` : target === "company" ? "company name" : target;
}

/**
 * Imports contacts or companies from a CSV file in two steps - pick the file and what it holds, then check which column goes where
 * (the server suggests a mapping) - and lists the workspace's imports with their progress and the rows they skipped.
 */
export default function ImportWizard() {
    const { workspace } = useCrm();
    const [objectType, setObjectType] = useState<CrmObjectType>("contact");
    const [file, setFile] = useState<File | null>(null);
    const [upload, setUpload] = useState<ImportUpload | null>(null);
    const [mapping, setMapping] = useState<ImportColumnMapping[]>([]);
    const [updateExisting, setUpdateExisting] = useState(true);
    const [tags, setTags] = useState("");
    const [imports, setImports] = useState<CrmImport[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function loadImports(): Promise<void> {
        try {
            setImports(await listImports(workspace.uid));
        } catch (err) {
            setError(errorMessage(err, "Could not load the imports."));
        }
    }

    useEffect(() => {
        void loadImports();
    }, [workspace.uid]);

    // Keeps the progress current while something is still to finish.
    const pending: boolean = imports.some((entry) => entry.status === "queued" || entry.status === "running");
    useEffect(() => {
        if (!pending) {
            return undefined;
        }
        const timer = setInterval(() => void loadImports(), IMPORT_POLL_MS);
        return () => clearInterval(timer);
    }, [pending, workspace.uid]);

    async function send(event: FormEvent): Promise<void> {
        event.preventDefault();
        setBusy(true);
        try {
            const uploaded: ImportUpload = await uploadImport(workspace.uid, objectType, file!);
            setUpload(uploaded);
            setMapping(uploaded.import.mapping);
            setError(null);
        } catch (err) {
            setError(errorMessage(err, "Could not read the file."));
        } finally {
            setBusy(false);
        }
    }

    async function start(event: FormEvent): Promise<void> {
        event.preventDefault();
        setBusy(true);
        try {
            await startImport(workspace.uid, upload!.import.uid, {
                mapping,
                updateExisting,
                tags: tags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
            });
            setUpload(null);
            setFile(null);
            setTags("");
            setError(null);
            await loadImports();
        } catch (err) {
            setError(errorMessage(err, "Could not start the import."));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="max-w-4xl">
            <h1 className="text-lg font-bold tracking-tight mb-4">Import</h1>
            {error && <Alert>{error}</Alert>}
            {!upload ? (
                <form onSubmit={send} className="flex flex-col gap-3 mb-8" aria-label="Upload">
                    <FormField label="The file holds" htmlFor="import-type">
                        <select id="import-type" className={`${INPUT_CLASS} !w-48`} value={objectType} onChange={(event) => setObjectType(event.target.value as CrmObjectType)}>
                            <option value="contact">Contacts</option>
                            <option value="company">Companies</option>
                        </select>
                    </FormField>
                    <FormField label="CSV file" htmlFor="import-file">
                        <input id="import-file" type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                    </FormField>
                    <Button type="submit" disabled={!file || busy} loading={busy} className="!w-auto self-start">
                        Upload
                    </Button>
                </form>
            ) : (
                <form onSubmit={start} className="flex flex-col gap-3 mb-8" aria-label="Map columns">
                    <p className="text-sm">
                        {upload.import.fileName}: {upload.import.totalRows} rows. Choose where each column goes.
                    </p>
                    <table className="text-sm border-collapse">
                        <thead>
                            <tr>
                                <th className="text-left py-1 px-2 border-b border-border">Column</th>
                                <th className="text-left py-1 px-2 border-b border-border">First value</th>
                                <th className="text-left py-1 px-2 border-b border-border">Import as</th>
                            </tr>
                        </thead>
                        <tbody>
                            {mapping.map((entry, index) => (
                                <tr key={entry.column}>
                                    <td className="py-1 px-2 border-b border-border">{entry.column}</td>
                                    <td className="py-1 px-2 border-b border-border text-text-muted">{upload.preview[0]?.[index] ?? ""}</td>
                                    <td className="py-1 px-2 border-b border-border">
                                        <select
                                            aria-label={`Import ${entry.column} as`}
                                            className={`${INPUT_CLASS} !w-56`}
                                            value={entry.target ?? ""}
                                            onChange={(event) =>
                                                setMapping((current) =>
                                                    current.map((item, position) => (position === index ? { column: item.column, target: event.target.value || undefined } : item)),
                                                )
                                            }
                                        >
                                            <option value="">Don&apos;t import</option>
                                            {upload.targets.map((target) => (
                                                <option key={target} value={target}>
                                                    {targetLabel(target)}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <label className="text-sm flex items-center gap-2">
                        <input type="checkbox" checked={updateExisting} onChange={(event) => setUpdateExisting(event.target.checked)} />
                        Update records that are already here
                    </label>
                    <FormField label="Tag everything imported with (comma-separated)" htmlFor="import-tags">
                        <input id="import-tags" className={`${INPUT_CLASS} !w-72`} value={tags} onChange={(event) => setTags(event.target.value)} />
                    </FormField>
                    <div className="flex gap-2">
                        <Button type="submit" disabled={busy} loading={busy} className="!w-auto">
                            Start import
                        </Button>
                        <Button type="button" variant="secondary" className="!w-auto" onClick={() => setUpload(null)}>
                            Cancel
                        </Button>
                    </div>
                </form>
            )}
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted mb-2">Recent imports</h2>
            {imports.length === 0 ? (
                <p className="text-sm text-text-muted">No imports yet.</p>
            ) : (
                <ul className="flex flex-col gap-3">
                    {imports.map((entry) => (
                        <li key={entry.uid} className="text-sm border border-border rounded-sm p-3">
                            <div className="flex items-center justify-between">
                                <span className="font-medium">
                                    {entry.fileName} &middot; {entry.objectType === "contact" ? "contacts" : "companies"}
                                </span>
                                <span className="text-text-muted">{entry.status}</span>
                            </div>
                            <div className="text-text-muted">
                                {entry.processedRows} of {entry.totalRows} rows: {entry.createdCount} created, {entry.updatedCount} updated, {entry.skippedCount} skipped
                            </div>
                            {entry.errors.length > 0 && (
                                <details className="mt-1">
                                    <summary className="cursor-pointer">Skipped rows</summary>
                                    <ul className="mt-1">
                                        {entry.errors.map((rowError) => (
                                            <li key={`${rowError.row}-${rowError.message}`}>
                                                Row {rowError.row}: {rowError.message}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                            {entry.status !== "running" && (
                                <button
                                    type="button"
                                    className="text-xs text-text-muted hover:text-danger mt-1"
                                    onClick={async () => {
                                        await deleteImport(workspace.uid, entry.uid);
                                        await loadImports();
                                    }}
                                >
                                    Remove
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
