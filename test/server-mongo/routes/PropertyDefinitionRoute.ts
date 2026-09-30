///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { PropertyDefinitionRouteMongo } from "../../../src/routes/mongo/PropertyDefinitionRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/properties")
export class PropertyDefinitionRoute extends PropertyDefinitionRouteMongo {}
