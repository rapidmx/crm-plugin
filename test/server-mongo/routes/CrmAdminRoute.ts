///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { CrmAdminRouteMongo } from "../../../src/routes/mongo/CrmAdminRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/admin")
export class CrmAdminRoute extends CrmAdminRouteMongo {}
