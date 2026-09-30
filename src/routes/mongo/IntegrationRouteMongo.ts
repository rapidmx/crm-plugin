///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BaseIntegrationRoute } from "../BaseIntegrationRoute.js";
import { ContactRouteMongo } from "./ContactRouteMongo.js";
const { ApiRoute } = RouteDecorators;

/** The API a workspace's own systems call with an API key (`/api/mail/crm/integrations`). */
@ApiRoute("mail/crm/integrations")
export class IntegrationRouteMongo extends BaseIntegrationRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
    protected contactRouteClass: any = ContactRouteMongo;
}
