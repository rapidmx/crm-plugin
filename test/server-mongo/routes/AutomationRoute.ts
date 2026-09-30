///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { AutomationRouteMongo } from "../../../src/routes/mongo/AutomationRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/automations")
export class AutomationRoute extends AutomationRouteMongo {}
