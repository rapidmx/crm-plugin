///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseSuppressionRoute } from "../BaseSuppressionRoute.js";
const { ApiRoute } = RouteDecorators;

/** Addresses a workspace never sends marketing mail to (`/api/mail/crm/suppressions`). */
@ApiRoute("mail/crm/suppressions")
export class SuppressionRouteSQL extends BaseSuppressionRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
