///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { ApiKeyRouteMongo } from "../../../src/routes/mongo/ApiKeyRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/api-keys")
export class ApiKeyRoute extends ApiKeyRouteMongo {}
