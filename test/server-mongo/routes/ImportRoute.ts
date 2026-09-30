///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { ImportRouteMongo } from "../../../src/routes/mongo/ImportRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/imports")
export class ImportRoute extends ImportRouteMongo {}
