///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { TaskRouteMongo } from "../../../src/routes/mongo/TaskRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/tasks")
export class TaskRoute extends TaskRouteMongo {}
