///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { SubscriptionRouteMongo } from "../../../src/routes/mongo/SubscriptionRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/subscriptions")
export class SubscriptionRoute extends SubscriptionRouteMongo {}
