///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { SegmentRouteSQL } from "../../../src/routes/sql/SegmentRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/segments")
export class SegmentRoute extends SegmentRouteSQL {}
