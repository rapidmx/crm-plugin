///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BaseSubscriptionRoute } from "../BaseSubscriptionRoute.js";
const { ApiRoute } = RouteDecorators;

/** Contacts' subscriptions to mailing lists (`/api/mail/crm/subscriptions`). */
@ApiRoute("mail/crm/subscriptions")
export class SubscriptionRouteMongo extends BaseSubscriptionRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
