///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { WebhookDeliveryJob } from "../WebhookDeliveryJob.js";

/** `WebhookDeliveryJob` on a Mongo deployment. */
export class WebhookDeliveryJobMongo extends WebhookDeliveryJob {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
