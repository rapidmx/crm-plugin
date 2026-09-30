///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { AnalyticsRouteMongo } from "../../../src/routes/mongo/AnalyticsRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/analytics")
export class AnalyticsRoute extends AnalyticsRouteMongo {}
