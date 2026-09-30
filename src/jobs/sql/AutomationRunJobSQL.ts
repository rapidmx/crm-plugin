///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { ContactRouteSQL } from "../../routes/sql/ContactRouteSQL.js";
import { AutomationRunJob } from "../AutomationRunJob.js";

/** `AutomationRunJob` on a SQL deployment. */
export class AutomationRunJobSQL extends AutomationRunJob {
    protected classes: CrmModelClasses = SQL_MODELS;
    protected contactRouteClass: any = ContactRouteSQL;
}
