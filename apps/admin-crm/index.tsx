///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import AdminShell, { AdminShellProps } from "@rapidmx/web-client/shared/components/admin/layout/AdminShell.js";
import CrmAdmin from "../shared/components/admin/CrmAdmin.js";

/** The CRM's page in the admin console. */
export default function CrmAdminPage(props: Omit<AdminShellProps, "active">) {
    return (
        <AdminShell {...props} active="crm">
            <CrmAdmin />
        </AdminShell>
    );
}
