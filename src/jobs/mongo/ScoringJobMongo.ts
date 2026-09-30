///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { ScoringJob } from "../ScoringJob.js";

/** `ScoringJob` on a Mongo deployment. */
export class ScoringJobMongo extends ScoringJob {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
