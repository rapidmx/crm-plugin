///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { SegmentRefreshJob } from "../SegmentRefreshJob.js";

/** `SegmentRefreshJob` on a Mongo deployment. */
export class SegmentRefreshJobMongo extends SegmentRefreshJob {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
