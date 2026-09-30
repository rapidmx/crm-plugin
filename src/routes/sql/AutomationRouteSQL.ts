///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseAutomationRoute } from "../BaseAutomationRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's automations (`/api/mail/crm/automations`). */
@ApiRoute("mail/crm/automations")
export class AutomationRouteSQL extends BaseAutomationRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
