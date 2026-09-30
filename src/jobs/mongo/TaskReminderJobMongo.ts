///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { TaskReminderJob } from "../TaskReminderJob.js";

/** `TaskReminderJob` on a Mongo deployment. */
export class TaskReminderJobMongo extends TaskReminderJob {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
