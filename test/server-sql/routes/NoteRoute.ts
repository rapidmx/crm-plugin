///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { NoteRouteSQL } from "../../../src/routes/sql/NoteRouteSQL.js";
const { Route } = RouteDecorators;

@Route("/sql/crm/notes")
export class NoteRoute extends NoteRouteSQL {}
