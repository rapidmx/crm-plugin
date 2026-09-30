///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import FormManager from "../../shared/components/FormManager.js";

/** The selected workspace's signup forms. */
export default function CrmFormsPage(props: CrmPageProps) {
    return (
        <CrmShell {...props} section="forms">
            <FormManager />
        </CrmShell>
    );
}
