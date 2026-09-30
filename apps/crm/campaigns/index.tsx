///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import CampaignList from "../../shared/components/campaigns/CampaignList.js";

/** The selected workspace's campaigns. */
export default function CrmCampaignsPage(props: CrmPageProps) {
    return (
        <CrmShell {...props} section="campaigns">
            <CampaignList />
        </CrmShell>
    );
}
