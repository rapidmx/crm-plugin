///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { SavedBlockRouteSQL } from "../../../src/routes/sql/SavedBlockRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/saved-blocks")
export class SavedBlockRoute extends SavedBlockRouteSQL {}
