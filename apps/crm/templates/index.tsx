///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import TemplateList from "../../shared/components/TemplateList.js";

/** The selected workspace's email templates. */
export default function CrmTemplatesPage(props: CrmPageProps) {
    return (
        <CrmShell {...props} section="templates">
            <TemplateList />
        </CrmShell>
    );
}
