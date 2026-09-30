///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BasePropertyDefinitionRoute } from "../BasePropertyDefinitionRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's custom properties (`/api/mail/crm/properties`). */
@ApiRoute("mail/crm/properties")
export class PropertyDefinitionRouteMongo extends BasePropertyDefinitionRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
