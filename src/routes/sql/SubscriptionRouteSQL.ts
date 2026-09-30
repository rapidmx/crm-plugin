///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseSubscriptionRoute } from "../BaseSubscriptionRoute.js";
const { ApiRoute } = RouteDecorators;

/** Contacts' subscriptions to mailing lists (`/api/mail/crm/subscriptions`). */
@ApiRoute("mail/crm/subscriptions")
export class SubscriptionRouteSQL extends BaseSubscriptionRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
