///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { TaskRouteSQL } from "../../../src/routes/sql/TaskRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/tasks")
export class TaskRoute extends TaskRouteSQL {}
