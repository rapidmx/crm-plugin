///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BasePublicRoute } from "../BasePublicRoute.js";
import { ContactRouteMongo } from "./ContactRouteMongo.js";
const { ApiRoute } = RouteDecorators;

/** The anonymous endpoints of forms, the preference center and unsubscribe links (`/api/mail/crm/public`). */
@ApiRoute("mail/crm/public")
export class PublicRouteMongo extends BasePublicRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
    protected contactRouteClass: any = ContactRouteMongo;
}
