///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BaseScoringRuleRoute } from "../BaseScoringRuleRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's lead scoring rules (`/api/mail/crm/scoring-rules`). */
@ApiRoute("mail/crm/scoring-rules")
export class ScoringRuleRouteMongo extends BaseScoringRuleRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
