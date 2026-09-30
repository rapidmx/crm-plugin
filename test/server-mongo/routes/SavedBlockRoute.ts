///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { SavedBlockRouteMongo } from "../../../src/routes/mongo/SavedBlockRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/saved-blocks")
export class SavedBlockRoute extends SavedBlockRouteMongo {}
