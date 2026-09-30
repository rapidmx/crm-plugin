///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import WorkspaceSettings from "../../shared/components/WorkspaceSettings.js";

/** The selected workspace's settings. */
export default function CrmSettingsPage(props: CrmPageProps) {
    return (
        <CrmShell {...props} section="settings">
            <WorkspaceSettings />
        </CrmShell>
    );
}
