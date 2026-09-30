///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { CampaignRouteMongo } from "../../../src/routes/mongo/CampaignRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/campaigns")
export class CampaignRoute extends CampaignRouteMongo {}
