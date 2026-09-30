///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseWebhookRoute } from "../BaseWebhookRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's webhook endpoints (`/api/mail/crm/webhooks`). */
@ApiRoute("mail/crm/webhooks")
export class WebhookRouteSQL extends BaseWebhookRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
