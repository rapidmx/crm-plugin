///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { ApiKeyRouteSQL } from "../../../src/routes/sql/ApiKeyRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/api-keys")
export class ApiKeyRoute extends ApiKeyRouteSQL {}
