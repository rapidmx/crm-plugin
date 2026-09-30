///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import CrmShell, { CrmPageProps } from "../../shared/components/CrmShell.js";
import TaskList from "../../shared/components/TaskList.js";

/** The selected workspace's tasks. */
export default function CrmTasksPage(props: CrmPageProps) {
    return (
        <CrmShell {...props} section="tasks">
            <TaskList />
        </CrmShell>
    );
}
