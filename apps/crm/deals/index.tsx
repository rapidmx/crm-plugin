///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import DealBoard from "../../shared/components/deals/DealBoard.js";

/** The selected workspace's deals, as a board. */
export default function CrmDealsPage(props: CrmPageProps) {
    return (
        <CrmShell {...props} section="deals">
            <DealBoard />
        </CrmShell>
    );
}
