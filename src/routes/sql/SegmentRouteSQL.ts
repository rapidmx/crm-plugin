///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseSegmentRoute } from "../BaseSegmentRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's contact segments (`/api/mail/crm/segments`). */
@ApiRoute("mail/crm/segments")
export class SegmentRouteSQL extends BaseSegmentRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
