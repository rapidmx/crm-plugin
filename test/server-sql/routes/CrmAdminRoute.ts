///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { CrmAdminRouteSQL } from "../../../src/routes/sql/CrmAdminRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/admin")
export class CrmAdminRoute extends CrmAdminRouteSQL {}
