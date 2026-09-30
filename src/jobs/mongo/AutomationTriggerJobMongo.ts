///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { AutomationTriggerJob } from "../AutomationTriggerJob.js";

/** `AutomationTriggerJob` on a Mongo deployment. */
export class AutomationTriggerJobMongo extends AutomationTriggerJob {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
