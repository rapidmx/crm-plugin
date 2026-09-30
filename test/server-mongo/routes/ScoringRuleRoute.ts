///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { ScoringRuleRouteMongo } from "../../../src/routes/mongo/ScoringRuleRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/scoring-rules")
export class ScoringRuleRoute extends ScoringRuleRouteMongo {}
