///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseSavedBlockRoute } from "../BaseSavedBlockRoute.js";
const { ApiRoute } = RouteDecorators;

/** Blocks saved for reuse in a workspace's templates (`/api/mail/crm/saved-blocks`). */
@ApiRoute("mail/crm/saved-blocks")
export class SavedBlockRouteSQL extends BaseSavedBlockRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
