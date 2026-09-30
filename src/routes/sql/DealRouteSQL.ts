///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseDealRoute } from "../BaseDealRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's deals (`/api/mail/crm/deals`). */
@ApiRoute("mail/crm/deals")
export class DealRouteSQL extends BaseDealRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
