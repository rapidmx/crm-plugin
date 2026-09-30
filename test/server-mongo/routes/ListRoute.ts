///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { ListRouteMongo } from "../../../src/routes/mongo/ListRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/lists")
export class ListRoute extends ListRouteMongo {}
