///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BaseTemplateRoute } from "../BaseTemplateRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's email templates (`/api/mail/crm/templates`). */
@ApiRoute("mail/crm/templates")
export class TemplateRouteMongo extends BaseTemplateRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
