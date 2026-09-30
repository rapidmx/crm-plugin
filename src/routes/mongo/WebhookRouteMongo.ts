///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BaseWebhookRoute } from "../BaseWebhookRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's webhook endpoints (`/api/mail/crm/webhooks`). */
@ApiRoute("mail/crm/webhooks")
export class WebhookRouteMongo extends BaseWebhookRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
