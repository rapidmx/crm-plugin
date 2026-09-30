///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BasePublicRoute } from "../BasePublicRoute.js";
import { ContactRouteSQL } from "./ContactRouteSQL.js";
const { ApiRoute } = RouteDecorators;

/** The anonymous endpoints of forms, the preference center and unsubscribe links (`/api/mail/crm/public`). */
@ApiRoute("mail/crm/public")
export class PublicRouteSQL extends BasePublicRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
    protected contactRouteClass: any = ContactRouteSQL;
}
