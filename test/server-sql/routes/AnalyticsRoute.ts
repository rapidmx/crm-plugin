///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { AnalyticsRouteSQL } from "../../../src/routes/sql/AnalyticsRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/analytics")
export class AnalyticsRoute extends AnalyticsRouteSQL {}
