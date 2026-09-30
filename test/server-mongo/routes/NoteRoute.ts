///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { NoteRouteMongo } from "../../../src/routes/mongo/NoteRouteMongo.js";
const { Route } = RouteDecorators;

@Route("/mongo/crm/notes")
export class NoteRoute extends NoteRouteMongo {}
