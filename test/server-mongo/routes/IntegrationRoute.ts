///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { IntegrationRouteMongo } from "../../../src/routes/mongo/IntegrationRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/integrations")
export class IntegrationRoute extends IntegrationRouteMongo {}
