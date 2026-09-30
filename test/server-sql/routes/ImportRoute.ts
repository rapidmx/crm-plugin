///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { ImportRouteSQL } from "../../../src/routes/sql/ImportRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/imports")
export class ImportRoute extends ImportRouteSQL {}
