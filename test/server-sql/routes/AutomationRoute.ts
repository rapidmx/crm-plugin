///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { AutomationRouteSQL } from "../../../src/routes/sql/AutomationRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/automations")
export class AutomationRoute extends AutomationRouteSQL {}
