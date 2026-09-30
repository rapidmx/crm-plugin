///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { WorkspaceRouteMongo } from "../../../src/routes/mongo/WorkspaceRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/workspaces")
export class WorkspaceRoute extends WorkspaceRouteMongo {}
