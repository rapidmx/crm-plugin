///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { SegmentRouteMongo } from "../../../src/routes/mongo/SegmentRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/segments")
export class SegmentRoute extends SegmentRouteMongo {}
