///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseTimelineRoute } from "../BaseTimelineRoute.js";
const { ApiRoute } = RouteDecorators;

/** Contact and company activity timelines (`/api/mail/crm/timeline`). */
@ApiRoute("mail/crm/timeline")
export class TimelineRouteSQL extends BaseTimelineRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
