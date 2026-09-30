///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { TrackingRouteSQL } from "../../../src/routes/sql/TrackingRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/t")
export class TrackingRoute extends TrackingRouteSQL {}
