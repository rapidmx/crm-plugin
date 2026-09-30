///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import RecordDetail from "../../shared/components/RecordDetail.js";

/** One company. */
export default function CrmCompanyPage(props: CrmPageProps & { params: { uid: string } }) {
    return (
        <CrmShell {...props} section="companies">
            <RecordDetail objectType="company" uid={props.params.uid} />
        </CrmShell>
    );
}
