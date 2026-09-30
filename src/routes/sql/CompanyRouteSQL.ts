///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseCompanyRoute } from "../BaseCompanyRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's companies (`/api/mail/crm/companies`). */
@ApiRoute("mail/crm/companies")
export class CompanyRouteSQL extends BaseCompanyRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
