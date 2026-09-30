///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, PropsWithChildren, createContext, useContext, useEffect, useState } from "react";
import {
    HiOutlineArrowUpTray,
    HiOutlineBuildingOffice2,
    HiOutlineClipboardDocumentCheck,
    HiOutlineCog6Tooth,
    HiOutlineDocumentText,
    HiOutlineQueueList,
    HiOutlineUsers,
} from "react-icons/hi2";
import type { IconType } from "react-icons";
import AppShell, { AppShellProps } from "@rapidmx/web-client/shared/components/layout/AppShell.js";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import { Workspace, createWorkspace, errorMessage, listWorkspaces } from "../crmApi.js";

/** The props every CRM page receives from the server (the `www` host's), passed straight to its shell. */
export type CrmPageProps = Omit<AppShellProps, "active">;

/** The CRM's sections, each a page under `/crm`. */
export type CrmSection = "contacts" | "companies" | "lists" | "forms" | "tasks" | "imports" | "settings";

/** Where the selected workspace is remembered between visits (per browser). */
export const WORKSPACE_STORAGE_KEY = "rapidmx.crm.workspace";

export const INPUT_CLASS = "w-full text-sm py-2 px-3 border border-border rounded-sm bg-surface text-text focus:outline-none focus:border-primary";

const SECTIONS: { id: CrmSection; label: string; path: string; icon: IconType }[] = [
    { id: "contacts", label: "Contacts", path: "/crm", icon: HiOutlineUsers },
    { id: "companies", label: "Companies", path: "/crm/companies", icon: HiOutlineBuildingOffice2 },
    { id: "lists", label: "Lists", path: "/crm/lists", icon: HiOutlineQueueList },
    { id: "forms", label: "Forms", path: "/crm/forms", icon: HiOutlineDocumentText },
    { id: "tasks", label: "Tasks", path: "/crm/tasks", icon: HiOutlineClipboardDocumentCheck },
    { id: "imports", label: "Import", path: "/crm/imports", icon: HiOutlineArrowUpTray },
    { id: "settings", label: "Settings", path: "/crm/settings", icon: HiOutlineCog6Tooth },
];

export interface CrmContextValue {
    /** The selected workspace. */
    workspace: Workspace;
    workspaces: Workspace[];
    /** The caller may create and change records. */
    canWrite: boolean;
    /** The caller may change the workspace's settings, members and properties. */
    canManage: boolean;
    /** `path` with the selected workspace in its query (`?w=`), for links between CRM pages. */
    href: (path: string) => string;
    /** Loads the workspace list again (after a rename, say). */
    reload: () => Promise<void>;
}

const CrmContext = createContext<CrmContextValue | null>(null);

/** The CRM context of the page (inside a `CrmShell` that has a workspace). */
export function useCrm(): CrmContextValue {
    const value: CrmContextValue | null = useContext(CrmContext);
    if (!value) {
        throw new Error("useCrm() must be used inside a CrmShell with a workspace.");
    }
    return value;
}

/** `path` with `w=<workspaceUid>` added to its query. */
export function workspaceHref(path: string, workspaceUid: string): string {
    return `${path}${path.includes("?") ? "&" : "?"}w=${encodeURIComponent(workspaceUid)}`;
}

/** The workspace uid of the page's `?w=`, else the one last used in this browser. */
function preferredWorkspace(): string | null {
    const fromUrl: string | null = new URLSearchParams(window.location.search).get("w");
    if (fromUrl) {
        return fromUrl;
    }
    try {
        return window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    } catch {
        return null;
    }
}

function remember(workspaceUid: string): void {
    try {
        window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceUid);
    } catch {
        // Storage blocked: the workspace is simply not remembered.
    }
}

/**
 * The frame of every CRM page: the web client's app chrome (with CRM highlighted on the app rail), a sidebar with the workspace
 * switcher and the CRM's sections, and the page. It loads the caller's workspaces and picks one (`?w=`, else the last used, else the
 * first); a caller with none is asked to create one. Pages read the selection with `useCrm()`.
 */
export default function CrmShell({ section, children, ...props }: PropsWithChildren<CrmPageProps & { section: CrmSection }>) {
    const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
    const [selected, setSelected] = useState<Workspace | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function load(preferred: string | null): Promise<void> {
        try {
            const list: Workspace[] = await listWorkspaces();
            setWorkspaces(list);
            const choice: Workspace | undefined = list.find((workspace) => workspace.uid === preferred) ?? list[0];
            setSelected(choice ?? null);
            if (choice) {
                remember(choice.uid);
            }
        } catch (err) {
            setError(errorMessage(err, "Could not load your CRM workspaces."));
        }
    }

    useEffect(() => {
        void load(preferredWorkspace());
    }, []);

    function switchTo(workspaceUid: string): void {
        remember(workspaceUid);
        window.location.assign(workspaceHref(window.location.pathname, workspaceUid));
    }

    const context: CrmContextValue | null = selected
        ? {
              workspace: selected,
              workspaces: workspaces ?? [],
              canWrite: selected.role !== "viewer",
              canManage: selected.role === "owner" || selected.role === "admin",
              href: (path: string) => workspaceHref(path, selected.uid),
              reload: () => load(selected.uid),
          }
        : null;

    return (
        <AppShell {...props} active="crm">
            <div className="flex flex-1 min-w-0 min-h-0">
                {context && (
                    <nav aria-label="CRM" className="w-56 shrink-0 border-r border-border p-3 flex flex-col gap-1 overflow-y-auto">
                        <label htmlFor="crm-workspace" className="text-xs uppercase tracking-wide text-text-muted px-2">
                            Workspace
                        </label>
                        <select id="crm-workspace" className={`${INPUT_CLASS} mb-3`} value={context.workspace.uid} onChange={(event) => switchTo(event.target.value)}>
                            {context.workspaces.map((workspace) => (
                                <option key={workspace.uid} value={workspace.uid}>
                                    {workspace.name}
                                </option>
                            ))}
                        </select>
                        {SECTIONS.map(({ id, label, path, icon: Icon }) => (
                            <a
                                key={id}
                                href={context.href(path)}
                                aria-current={id === section ? "page" : undefined}
                                className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm ${
                                    id === section ? "bg-primary-lightest text-primary-dark font-semibold" : "text-text hover:bg-surface-alt"
                                }`}
                            >
                                <Icon aria-hidden className="w-4 h-4" />
                                {label}
                            </a>
                        ))}
                    </nav>
                )}
                <main className="flex-1 min-w-0 overflow-y-auto p-6">
                    {error && <Alert>{error}</Alert>}
                    {!error && workspaces === null && <p className="text-sm text-text-muted">Loading&hellip;</p>}
                    {workspaces !== null && !context && <CreateFirstWorkspace onCreated={(workspace) => switchTo(workspace.uid)} />}
                    {context && <CrmContext.Provider value={context}>{children}</CrmContext.Provider>}
                </main>
            </div>
        </AppShell>
    );
}

/** The form a caller with no workspace sees. */
export function CreateFirstWorkspace({ onCreated }: { onCreated: (workspace: Workspace) => void }) {
    const [name, setName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setSaving(true);
        try {
            onCreated(await createWorkspace({ name, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
        } catch (err) {
            setError(errorMessage(err, "Could not create the workspace."));
            setSaving(false);
        }
    }

    return (
        <form onSubmit={submit} className="max-w-md">
            <h1 className="text-lg font-bold tracking-tight mb-2">Create your CRM workspace</h1>
            <p className="text-sm text-text-muted mb-4">
                A workspace holds your team&apos;s contacts, companies and tasks. You can invite colleagues to it once it exists.
            </p>
            {error && <Alert>{error}</Alert>}
            <FormField label="Name" htmlFor="crm-new-workspace">
                <input id="crm-new-workspace" className={INPUT_CLASS} value={name} onChange={(event) => setName(event.target.value)} required />
            </FormField>
            <Button type="submit" loading={saving} disabled={saving || name.trim().length === 0} className="!w-auto mt-3">
                Create workspace
            </Button>
        </form>
    );
}
