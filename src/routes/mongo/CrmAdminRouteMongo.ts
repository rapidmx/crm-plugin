///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BaseCrmAdminRoute } from "../BaseCrmAdminRoute.js";
const { ApiRoute } = RouteDecorators;

/** Deployment administration of the CRM (`/api/mail/crm/admin`). */
@ApiRoute("mail/crm/admin")
export class CrmAdminRouteMongo extends BaseCrmAdminRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
