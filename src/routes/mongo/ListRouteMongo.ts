///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BaseListRoute } from "../BaseListRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's mailing lists (`/api/mail/crm/lists`). */
@ApiRoute("mail/crm/lists")
export class ListRouteMongo extends BaseListRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
