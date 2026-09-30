///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { ContactRouteSQL } from "../../../src/routes/sql/ContactRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/contacts")
export class ContactRoute extends ContactRouteSQL {}
