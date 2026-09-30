///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { FormRouteSQL } from "../../../src/routes/sql/FormRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/forms")
export class FormRoute extends FormRouteSQL {}
