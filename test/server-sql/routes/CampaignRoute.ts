///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { CampaignRouteSQL } from "../../../src/routes/sql/CampaignRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/campaigns")
export class CampaignRoute extends CampaignRouteSQL {}
