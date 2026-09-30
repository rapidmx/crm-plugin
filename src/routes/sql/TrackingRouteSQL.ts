///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseTrackingRoute } from "../BaseTrackingRoute.js";
const { ApiRoute } = RouteDecorators;

/** The anonymous open and click tracking endpoints of CRM email (`/api/mail/crm/t`). */
@ApiRoute("mail/crm/t")
export class TrackingRouteSQL extends BaseTrackingRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
