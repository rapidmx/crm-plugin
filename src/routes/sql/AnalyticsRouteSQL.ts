///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseAnalyticsRoute } from "../BaseAnalyticsRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's reports (`/api/mail/crm/analytics`). */
@ApiRoute("mail/crm/analytics")
export class AnalyticsRouteSQL extends BaseAnalyticsRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
