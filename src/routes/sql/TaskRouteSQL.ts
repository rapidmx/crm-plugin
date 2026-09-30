///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { BaseTaskRoute } from "../BaseTaskRoute.js";
const { ApiRoute } = RouteDecorators;

/** A workspace's tasks (`/api/mail/crm/tasks`). */
@ApiRoute("mail/crm/tasks")
export class TaskRouteSQL extends BaseTaskRoute {
    protected classes: CrmModelClasses = SQL_MODELS;
}
