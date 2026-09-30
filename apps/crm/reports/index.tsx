///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import Reports from "../../shared/components/reports/Reports.js";

/** The selected workspace's reports. */
export default function CrmReportsPage(props: CrmPageProps) {
    return (
        <CrmShell {...props} section="reports">
            <Reports />
        </CrmShell>
    );
}
