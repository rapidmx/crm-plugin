///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import ListManager from "../../shared/components/ListManager.js";

/** The selected workspace's mailing lists. */
export default function CrmListsPage(props: CrmPageProps) {
    return (
        <CrmShell {...props} section="lists">
            <ListManager />
        </CrmShell>
    );
}
