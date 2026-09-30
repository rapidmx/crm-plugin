///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { SuppressionRouteMongo } from "../../../src/routes/mongo/SuppressionRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/suppressions")
export class SuppressionRoute extends SuppressionRouteMongo {}
