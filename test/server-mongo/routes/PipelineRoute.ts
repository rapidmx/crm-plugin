///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { PipelineRouteMongo } from "../../../src/routes/mongo/PipelineRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/pipelines")
export class PipelineRoute extends PipelineRouteMongo {}
