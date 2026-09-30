///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import { AdminStats, AdminWorkspace, adminStats, adminWorkspaces, errorMessage, setWorkspaceSending } from "../../crmApi.js";

/** Workspaces per page. */
export const ADMIN_PAGE_SIZE = 50;

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className="border border-border rounded-sm p-3">
            <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
            <div className="text-xl font-bold">{value.toLocaleString()}</div>
        </div>
    );
}

/**
 * The deployment's CRM, for its administrators: how many workspaces and contacts there are and how much mail is going out, every
 * workspace with its size, and the switch that stops a workspace's campaign and automation email (its messages wait, queued, until
 * it is switched back on). Administrators see no workspace's contents here.
 */
export default function CrmAdmin() {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
    const [total, setTotal] = useState<number>(0);
    const [page, setPage] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);

    async function load(): Promise<void> {
        try {
            const [nextStats, listed] = await Promise.all([adminStats(), adminWorkspaces(page, ADMIN_PAGE_SIZE)]);
            setStats(nextStats);
            setWorkspaces(listed.items);
            setTotal(listed.total);
        } catch (err) {
            setError(errorMessage(err, "Could not load the CRM's workspaces."));
        }
    }

    useEffect(() => {
        void load();
    }, [page]);

    async function toggle(workspace: AdminWorkspace): Promise<void> {
        const stopping: boolean = !workspace.sendingDisabled;
        if (stopping && !window.confirm(`Stop all campaign and automation email from "${workspace.name}"? Its messages wait until you let it send again.`)) {
            return;
        }
        setError(null);
        try {
            await setWorkspaceSending(workspace.uid, stopping);
            await load();
        } catch (err) {
            setError(errorMessage(err, "Could not change the workspace."));
        }
    }

    const pages: number = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
    return (
        <div className="p-6">
            <h1 className="text-xl font-bold mb-1">CRM</h1>
            <p className="text-sm text-text-muted mb-4">
                Every CRM workspace on this deployment. Stopping a workspace's sending holds its campaign and automation email - for abuse, or a
                compromised account - without touching its data.
            </p>
            {error && <Alert>{error}</Alert>}
            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    <Stat label="Workspaces" value={stats.workspaces} />
                    <Stat label="Contacts" value={stats.contacts} />
                    <Stat label="Sent in the last day" value={stats.sentLastDay} />
                    <Stat label="Waiting to send" value={stats.queued} />
                </div>
            )}
            {stats && workspaces.length === 0 ? (
                <p className="text-sm text-text-muted">No workspaces yet.</p>
            ) : (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-text-muted">
                            <th className="font-normal py-1">Workspace</th>
                            <th className="font-normal py-1">Created</th>
                            <th className="font-normal py-1 text-right">Members</th>
                            <th className="font-normal py-1 text-right">Contacts</th>
                            <th className="font-normal py-1 text-right">Campaigns sent</th>
                            <th className="font-normal py-1">Sending</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {workspaces.map((workspace) => (
                            <tr key={workspace.uid} className="border-t border-border">
                                <td className="py-1">{workspace.name}</td>
                                <td className="py-1">{new Date(workspace.dateCreated).toLocaleDateString()}</td>
                                <td className="py-1 text-right tabular-nums">{workspace.members.toLocaleString()}</td>
                                <td className="py-1 text-right tabular-nums">{workspace.contacts.toLocaleString()}</td>
                                <td className="py-1 text-right tabular-nums">{workspace.campaignsSent.toLocaleString()}</td>
                                <td className="py-1">{workspace.sendingDisabled ? <span className="font-semibold text-danger">Stopped</span> : "Allowed"}</td>
                                <td className="py-1 text-right">
                                    <Button variant="text" onClick={() => void toggle(workspace)}>
                                        {workspace.sendingDisabled ? "Let it send" : "Stop sending"}
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {pages > 1 && (
                <div className="flex items-center gap-3 mt-3 text-sm">
                    <Button variant="text" disabled={page === 0} onClick={() => setPage(page - 1)}>
                        Previous
                    </Button>
                    <span>
                        Page {page + 1} of {pages}
                    </span>
                    <Button variant="text" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
                        Next
                    </Button>
                </div>
            )}
        </div>
    );
}
