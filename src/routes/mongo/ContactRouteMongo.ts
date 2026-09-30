///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BaseContactRoute } from "../BaseContactRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's contacts (`/api/mail/crm/contacts`). */
@ApiRoute("mail/crm/contacts")
export class ContactRouteMongo extends BaseContactRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
