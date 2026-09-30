///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseImportRoute } from "../BaseImportRoute.js";
const { ApiRoute } = RouteDecorators;

/** CSV imports of contacts and companies (`/api/mail/crm/imports`). */
@ApiRoute("mail/crm/imports")
export class ImportRouteSQL extends BaseImportRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
