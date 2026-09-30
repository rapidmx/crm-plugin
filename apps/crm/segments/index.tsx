///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import SegmentManager from "../../shared/components/SegmentManager.js";

/** The selected workspace's segments. */
export default function CrmSegmentsPage(props: CrmPageProps) {
    return (
        <CrmShell {...props} section="segments">
            <SegmentManager />
        </CrmShell>
    );
}
