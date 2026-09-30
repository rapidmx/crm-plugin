///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseCrmAdminRoute } from "../BaseCrmAdminRoute.js";
const { ApiRoute } = RouteDecorators;

/** Deployment administration of the CRM (`/api/mail/crm/admin`). */
@ApiRoute("mail/crm/admin")
export class CrmAdminRouteSQL extends BaseCrmAdminRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
