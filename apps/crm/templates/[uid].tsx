///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import TemplateDesigner from "../../shared/components/designer/TemplateDesigner.js";

/** One email template, in the designer. */
export default function CrmTemplatePage(props: CrmPageProps & { params: { uid: string } }) {
    return (
        <CrmShell {...props} section="templates">
            <TemplateDesigner uid={props.params.uid} />
        </CrmShell>
    );
}
