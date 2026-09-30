///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BaseFormRoute } from "../BaseFormRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's signup forms (`/api/mail/crm/forms`). */
@ApiRoute("mail/crm/forms")
export class FormRouteMongo extends BaseFormRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
