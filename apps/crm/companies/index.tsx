///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import RecordList from "../../shared/components/RecordList.js";

/** The selected workspace's companies. */
export default function CrmCompaniesPage(props: CrmPageProps) {
    return (
        <CrmShell {...props} section="companies">
            <RecordList objectType="company" />
        </CrmShell>
    );
}
