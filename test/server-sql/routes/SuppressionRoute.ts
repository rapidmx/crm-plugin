///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { SuppressionRouteSQL } from "../../../src/routes/sql/SuppressionRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/suppressions")
export class SuppressionRoute extends SuppressionRouteSQL {}
