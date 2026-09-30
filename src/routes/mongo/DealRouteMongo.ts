///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BaseDealRoute } from "../BaseDealRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's deals (`/api/mail/crm/deals`). */
@ApiRoute("mail/crm/deals")
export class DealRouteMongo extends BaseDealRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
