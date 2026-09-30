///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { CompanyRouteSQL } from "../../../src/routes/sql/CompanyRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/companies")
export class CompanyRoute extends CompanyRouteSQL {}
