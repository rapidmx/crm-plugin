///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseScoringRuleRoute } from "../BaseScoringRuleRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's lead scoring rules (`/api/mail/crm/scoring-rules`). */
@ApiRoute("mail/crm/scoring-rules")
export class ScoringRuleRouteSQL extends BaseScoringRuleRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
