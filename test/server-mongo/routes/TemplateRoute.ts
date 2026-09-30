///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { TemplateRouteMongo } from "../../../src/routes/mongo/TemplateRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/templates")
export class TemplateRoute extends TemplateRouteMongo {}
