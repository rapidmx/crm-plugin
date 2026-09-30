///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { PropertyDefinitionRouteSQL } from "../../../src/routes/sql/PropertyDefinitionRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/properties")
export class PropertyDefinitionRoute extends PropertyDefinitionRouteSQL {}
