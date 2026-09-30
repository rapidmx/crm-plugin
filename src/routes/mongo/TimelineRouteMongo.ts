///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BaseTimelineRoute } from "../BaseTimelineRoute.js";
const { ApiRoute } = RouteDecorators;

/** Contact and company activity timelines (`/api/mail/crm/timeline`). */
@ApiRoute("mail/crm/timeline")
export class TimelineRouteMongo extends BaseTimelineRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
