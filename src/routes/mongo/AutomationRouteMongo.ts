///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BaseAutomationRoute } from "../BaseAutomationRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's automations (`/api/mail/crm/automations`). */
@ApiRoute("mail/crm/automations")
export class AutomationRouteMongo extends BaseAutomationRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
