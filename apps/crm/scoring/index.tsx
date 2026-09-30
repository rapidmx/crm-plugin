///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import ScoringRules from "../../shared/components/ScoringRules.js";

/** The selected workspace's lead scoring rules. */
export default function CrmScoringPage(props: CrmPageProps) {
    return (
        <CrmShell {...props} section="scoring">
            <ScoringRules />
        </CrmShell>
    );
}
