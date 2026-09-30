///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BaseTrackingRoute } from "../BaseTrackingRoute.js";
const { ApiRoute } = RouteDecorators;

/** The anonymous open and click tracking endpoints of CRM email (`/api/mail/crm/t`). */
@ApiRoute("mail/crm/t")
export class TrackingRouteMongo extends BaseTrackingRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
