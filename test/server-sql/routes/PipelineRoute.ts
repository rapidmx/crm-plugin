///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { PipelineRouteSQL } from "../../../src/routes/sql/PipelineRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/pipelines")
export class PipelineRoute extends PipelineRouteSQL {}
