///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { SubscriptionRouteSQL } from "../../../src/routes/sql/SubscriptionRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/subscriptions")
export class SubscriptionRoute extends SubscriptionRouteSQL {}
