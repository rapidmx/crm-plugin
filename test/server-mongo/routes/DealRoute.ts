///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { DealRouteMongo } from "../../../src/routes/mongo/DealRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/deals")
export class DealRoute extends DealRouteMongo {}
