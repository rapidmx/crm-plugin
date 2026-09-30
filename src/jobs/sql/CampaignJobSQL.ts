///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { CampaignJob } from "../CampaignJob.js";

/** `CampaignJob` on a SQL deployment. */
export class CampaignJobSQL extends CampaignJob {
    protected classes: CrmModelClasses = SQL_MODELS;
}
