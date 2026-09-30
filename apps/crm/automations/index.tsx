///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import AutomationList from "../../shared/components/automations/AutomationList.js";

/** The selected workspace's automations. */
export default function CrmAutomationsPage(props: CrmPageProps) {
    return (
        <CrmShell {...props} section="automations">
            <AutomationList />
        </CrmShell>
    );
}
