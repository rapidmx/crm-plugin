///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { BaseNoteRoute } from "../BaseNoteRoute.js";
const { ApiRoute } = RouteDecorators;

/** Notes on contacts and companies (`/api/mail/crm/notes`). */
@ApiRoute("mail/crm/notes")
export class NoteRouteMongo extends BaseNoteRoute {
    protected classes: CrmModelClasses = MONGO_MODELS;
}
