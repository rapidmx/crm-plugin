///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BasePipelineRoute } from "../BasePipelineRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's sales pipelines (`/api/mail/crm/pipelines`). */
@ApiRoute("mail/crm/pipelines")
export class PipelineRouteMongo extends BasePipelineRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
