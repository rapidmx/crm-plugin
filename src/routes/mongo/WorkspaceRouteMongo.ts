///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BaseWorkspaceRoute } from "../BaseWorkspaceRoute.js";
const { ApiRoute } = RouteDecorators;

/** CRM workspaces, their members and senders (`/api/mail/crm/workspaces`). */
@ApiRoute("mail/crm/workspaces")
export class WorkspaceRouteMongo extends BaseWorkspaceRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
