///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { CompanyRouteMongo } from "../../../src/routes/mongo/CompanyRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/companies")
export class CompanyRoute extends CompanyRouteMongo {}
