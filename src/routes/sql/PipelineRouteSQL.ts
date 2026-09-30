///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BasePipelineRoute } from "../BasePipelineRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's sales pipelines (`/api/mail/crm/pipelines`). */
@ApiRoute("mail/crm/pipelines")
export class PipelineRouteSQL extends BasePipelineRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
