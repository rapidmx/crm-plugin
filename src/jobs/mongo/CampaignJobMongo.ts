///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { CampaignJob } from "../CampaignJob.js";

/** `CampaignJob` on a Mongo deployment. */
export class CampaignJobMongo extends CampaignJob {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
