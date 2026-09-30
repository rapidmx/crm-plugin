///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseApiKeyRoute } from "../BaseApiKeyRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's integration API keys (`/api/mail/crm/api-keys`). */
@ApiRoute("mail/crm/api-keys")
export class ApiKeyRouteSQL extends BaseApiKeyRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
