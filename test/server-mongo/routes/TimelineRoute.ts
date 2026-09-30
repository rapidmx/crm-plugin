///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { TimelineRouteMongo } from "../../../src/routes/mongo/TimelineRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/timeline")
export class TimelineRoute extends TimelineRouteMongo {}
