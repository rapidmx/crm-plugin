///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { DealRouteSQL } from "../../../src/routes/sql/DealRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/deals")
export class DealRoute extends DealRouteSQL {}
