///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import FormField from "@rapidmx/web-client/lib/components/forms/FormField.js";
import Modal from "@rapidmx/web-client/lib/components/overlays/Modal.js";
import { Campaign, createCampaign, deleteCampaign, duplicateCampaign, errorMessage, searchCampaigns } from "../../crmApi.js";
import { INPUT_CLASS, useCrm } from "../CrmShell.js";
import { StatusBadge, percent, when } from "./campaignUi.js";

const PAGE_SIZE = 50;
/** The states a campaign can't be deleted in: it must be cancelled first. */
const RUNNING: ReadonlySet<string> = new Set(["preparing", "sending", "paused"]);

/** A workspace's campaigns, newest first: their state, reach and results, and creating, duplicating and deleting them. */
export default function CampaignList() {
    const { workspace, canWrite, href } = useCrm();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function load(upTo: number): Promise<void> {
        try {
            const pages = await Promise.all(Array.from({ length: upTo + 1 }, (_unused, index) => searchCampaigns(workspace.uid, index, PAGE_SIZE)));
            setCampaigns(pages.flatMap((result) => result.items));
            setTotal(pages[0].total);
            setPage(upTo);
        } catch (err) {
            setError(errorMessage(err, "Could not load the campaigns."));
        }
    }

    useEffect(() => {
        void load(0);
    }, [workspace.uid]);

    const open = (campaign: Campaign) => window.location.assign(href(`/crm/campaigns/${encodeURIComponent(campaign.uid)}`));

    async function duplicate(campaign: Campaign): Promise<void> {
        try {
            open(await duplicateCampaign(workspace.uid, campaign.uid));
        } catch (err) {
            setError(errorMessage(err, "Could not duplicate the campaign."));
        }
    }

    async function remove(campaign: Campaign): Promise<void> {
        if (!window.confirm(`Delete the campaign "${campaign.name}" and its results?`)) {
            return;
        }
        try {
            await deleteCampaign(workspace.uid, campaign.uid);
            await load(page);
        } catch (err) {
            setError(errorMessage(err, "Could not delete the campaign."));
        }
    }

    return (
        <div className="max-w-6xl">
            <div className="flex items-center justify-between gap-2 mb-4">
                <h1 className="text-lg font-bold tracking-tight">Campaigns</h1>
                {canWrite && (
                    <Button type="button" className="!w-auto" onClick={() => setCreating(true)}>
                        + New campaign
                    </Button>
                )}
            </div>
            {error && <Alert>{error}</Alert>}
            {campaigns.length === 0 ? (
                <p className="text-sm text-text-muted">No campaigns yet.</p>
            ) : (
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr>
                            {["Name", "Status", "Sent or scheduled", "Recipients", "Opened", "Clicked", ""].map((heading) => (
                                <th key={heading} className="text-left text-xs uppercase tracking-wide text-text-muted py-2 px-2.5 border-b border-border">
                                    {heading}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {campaigns.map((campaign) => (
                            <tr key={campaign.uid}>
                                <td className="py-2 px-2.5 border-b border-border">
                                    <a className="font-medium text-primary-dark hover:underline" href={href(`/crm/campaigns/${encodeURIComponent(campaign.uid)}`)}>
                                        {campaign.name}
                                    </a>
                                    {campaign.abTest && <span className="ml-2 text-xs text-text-muted">A/B</span>}
                                </td>
                                <td className="py-2 px-2.5 border-b border-border">
                                    <StatusBadge status={campaign.status} />
                                </td>
                                <td className="py-2 px-2.5 border-b border-border whitespace-nowrap">{when(campaign.finishedAt ?? campaign.startedAt ?? campaign.scheduledAt)}</td>
                                <td className="py-2 px-2.5 border-b border-border">{campaign.recipientCount}</td>
                                <td className="py-2 px-2.5 border-b border-border">{percent(campaign.stats.opened, campaign.stats.sent)}</td>
                                <td className="py-2 px-2.5 border-b border-border">{percent(campaign.stats.clicked, campaign.stats.sent)}</td>
                                <td className="py-2 px-2.5 border-b border-border text-right whitespace-nowrap">
                                    {canWrite && (
                                        <>
                                            <button type="button" className="text-primary-dark hover:underline font-medium mr-4" onClick={() => void duplicate(campaign)}>
                                                Duplicate
                                            </button>
                                            {!RUNNING.has(campaign.status) && (
                                                <button type="button" className="text-danger hover:underline" onClick={() => void remove(campaign)}>
                                                    Delete
                                                </button>
                                            )}
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {campaigns.length < total && (
                <Button type="button" variant="secondary" className="!w-auto mt-3" onClick={() => void load(page + 1)}>
                    Show more
                </Button>
            )}
            <NewCampaignModal open={creating} onClose={() => setCreating(false)} onCreated={open} />
        </div>
    );
}

/** Asks for a new campaign's name and creates it as a draft. */
function NewCampaignModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (campaign: Campaign) => void }) {
    const { workspace } = useCrm();
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setSaving(true);
        try {
            onCreated(await createCampaign(workspace.uid, { name: name.trim() }));
        } catch (err) {
            setError(errorMessage(err, "Could not create the campaign."));
            setSaving(false);
        }
    }

    return (
        <Modal open={open} onClose={onClose} title="New campaign">
            <form onSubmit={submit} className="flex flex-col gap-3 min-w-[20rem]">
                {error && <Alert>{error}</Alert>}
                <FormField label="Name" htmlFor="crm-campaign-name">
                    <input id="crm-campaign-name" className={INPUT_CLASS} value={name} onChange={(event) => setName(event.target.value)} required />
                </FormField>
                <Button type="submit" loading={saving} disabled={saving || !name.trim()} className="!w-auto self-start">
                    Create
                </Button>
            </form>
        </Modal>
    );
}
