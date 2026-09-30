///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import Integrations from "../../shared/components/Integrations.js";

/** The selected workspace's webhooks and API keys. */
export default function CrmIntegrationsPage(props: CrmPageProps) {
    return (
        <CrmShell {...props} section="integrations">
            <Integrations />
        </CrmShell>
    );
}
