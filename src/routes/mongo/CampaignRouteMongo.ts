///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BaseCampaignRoute } from "../BaseCampaignRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's email campaigns (`/api/mail/crm/campaigns`). */
@ApiRoute("mail/crm/campaigns")
export class CampaignRouteMongo extends BaseCampaignRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
