///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { PublicRouteSQL } from "../../../src/routes/sql/PublicRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/public")
export class PublicRoute extends PublicRouteSQL {}
