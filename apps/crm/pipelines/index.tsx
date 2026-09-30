///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import PipelineManager from "../../shared/components/deals/PipelineManager.js";

/** The selected workspace's pipelines. */
export default function CrmPipelinesPage(props: CrmPageProps) {
    return (
        <CrmShell {...props} section="pipelines">
            <PipelineManager />
        </CrmShell>
    );
}
