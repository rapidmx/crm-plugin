///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import { Campaign, errorMessage, getCampaign } from "../../crmApi.js";
import { useCrm } from "../CrmShell.js";
import CampaignEditor from "./CampaignEditor.js";
import CampaignReport from "./CampaignReport.js";

/** One campaign: the editor while it's a draft or scheduled, its report from when it starts going out. */
export default function CampaignPage({ uid }: { uid: string }) {
    const { workspace } = useCrm();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getCampaign(workspace.uid, uid).then(setCampaign, (err) => setError(errorMessage(err, "Could not load the campaign.")));
    }, [workspace.uid, uid]);

    if (!campaign) {
        return error ? <Alert>{error}</Alert> : <p className="text-sm text-text-muted">Loading&hellip;</p>;
    }
    return campaign.status === "draft" || campaign.status === "scheduled" ? (
        <CampaignEditor key={campaign.status} campaign={campaign} onChanged={setCampaign} />
    ) : (
        <CampaignReport campaign={campaign} onChanged={setCampaign} />
    );
}
