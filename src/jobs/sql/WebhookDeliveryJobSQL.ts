///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { WebhookDeliveryJob } from "../WebhookDeliveryJob.js";

/** `WebhookDeliveryJob` on a SQL deployment. */
export class WebhookDeliveryJobSQL extends WebhookDeliveryJob {
    protected classes: CrmModelClasses = SQL_MODELS;
}
