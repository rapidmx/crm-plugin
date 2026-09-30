///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { TrackingRouteMongo } from "../../../src/routes/mongo/TrackingRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/t")
export class TrackingRoute extends TrackingRouteMongo {}
