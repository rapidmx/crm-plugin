///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import ImportWizard from "../../shared/components/ImportWizard.js";

/** CSV imports into the selected workspace. */
export default function CrmImportsPage(props: CrmPageProps) {
    return (
        <CrmShell {...props} section="imports">
            <ImportWizard />
        </CrmShell>
    );
}
