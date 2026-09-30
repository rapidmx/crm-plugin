///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { ContactRouteMongo } from "../../routes/mongo/ContactRouteMongo.js";
import { AutomationRunJob } from "../AutomationRunJob.js";

/** `AutomationRunJob` on a Mongo deployment. */
export class AutomationRunJobMongo extends AutomationRunJob {
    protected classes: CrmModelClasses = MONGO_MODELS;
    protected contactRouteClass: any = ContactRouteMongo;
}
