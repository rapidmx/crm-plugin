///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { WebhookRouteMongo } from "../../../src/routes/mongo/WebhookRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/webhooks")
export class WebhookRoute extends WebhookRouteMongo {}
