///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { ContactRouteMongo } from "../../../src/routes/mongo/ContactRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/contacts")
export class ContactRoute extends ContactRouteMongo {}
