///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { TemplateRouteSQL } from "../../../src/routes/sql/TemplateRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/templates")
export class TemplateRoute extends TemplateRouteSQL {}
