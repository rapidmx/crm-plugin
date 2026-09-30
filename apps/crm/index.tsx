///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../shared/components/CrmShell.js";
import RecordList from "../shared/components/RecordList.js";

/** The CRM's home: the selected workspace's contacts. */
export default function CrmContactsPage(props: CrmPageProps) {
    return (
        <CrmShell {...props} section="contacts">
            <RecordList objectType="contact" />
        </CrmShell>
    );
}
