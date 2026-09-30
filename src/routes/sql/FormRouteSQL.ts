///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseFormRoute } from "../BaseFormRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's signup forms (`/api/mail/crm/forms`). */
@ApiRoute("mail/crm/forms")
export class FormRouteSQL extends BaseFormRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
