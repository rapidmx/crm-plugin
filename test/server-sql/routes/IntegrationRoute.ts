///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { IntegrationRouteSQL } from "../../../src/routes/sql/IntegrationRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/integrations")
export class IntegrationRoute extends IntegrationRouteSQL {}
