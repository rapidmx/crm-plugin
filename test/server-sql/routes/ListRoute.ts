///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { ListRouteSQL } from "../../../src/routes/sql/ListRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/lists")
export class ListRoute extends ListRouteSQL {}
