///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import DealDetail from "../../shared/components/deals/DealDetail.js";

/** One deal. */
export default function CrmDealPage(props: CrmPageProps & { params: { uid: string } }) {
    return (
        <CrmShell {...props} section="deals">
            <DealDetail uid={props.params.uid} />
        </CrmShell>
    );
}
