///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { ScoringRuleRouteSQL } from "../../../src/routes/sql/ScoringRuleRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/scoring-rules")
export class ScoringRuleRoute extends ScoringRuleRouteSQL {}
