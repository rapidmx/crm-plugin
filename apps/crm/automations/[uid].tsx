///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import AutomationEditor from "../../shared/components/automations/AutomationEditor.js";

/** One automation, in its editor. */
export default function CrmAutomationPage(props: CrmPageProps & { params: { uid: string } }) {
    return (
        <CrmShell {...props} section="automations">
            <AutomationEditor uid={props.params.uid} />
        </CrmShell>
    );
}
