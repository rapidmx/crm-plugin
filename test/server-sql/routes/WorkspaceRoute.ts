///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { WorkspaceRouteSQL } from "../../../src/routes/sql/WorkspaceRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/workspaces")
export class WorkspaceRoute extends WorkspaceRouteSQL {}
