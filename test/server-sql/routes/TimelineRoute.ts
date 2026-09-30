///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { TimelineRouteSQL } from "../../../src/routes/sql/TimelineRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/timeline")
export class TimelineRoute extends TimelineRouteSQL {}
