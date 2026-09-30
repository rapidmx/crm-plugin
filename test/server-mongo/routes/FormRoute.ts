///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { FormRouteMongo } from "../../../src/routes/mongo/FormRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/forms")
export class FormRoute extends FormRouteMongo {}
