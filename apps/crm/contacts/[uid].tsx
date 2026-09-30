///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import RecordDetail from "../../shared/components/RecordDetail.js";

/** One contact. */
export default function CrmContactPage(props: CrmPageProps & { params: { uid: string } }) {
    return (
        <CrmShell {...props} section="contacts">
            <RecordDetail objectType="contact" uid={props.params.uid} />
        </CrmShell>
    );
}
