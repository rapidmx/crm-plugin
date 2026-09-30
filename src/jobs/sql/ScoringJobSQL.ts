///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { ScoringJob } from "../ScoringJob.js";

/** `ScoringJob` on a SQL deployment. */
export class ScoringJobSQL extends ScoringJob {
    protected classes: CrmModelClasses = SQL_MODELS;
}
