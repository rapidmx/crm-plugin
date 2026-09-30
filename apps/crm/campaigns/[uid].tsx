///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import CampaignPage from "../../shared/components/campaigns/CampaignPage.js";

/** One campaign: its editor, or its results. */
export default function CrmCampaignPage(props: CrmPageProps & { params: { uid: string } }) {
    return (
        <CrmShell {...props} section="campaigns">
            <CampaignPage uid={props.params.uid} />
        </CrmShell>
    );
}
