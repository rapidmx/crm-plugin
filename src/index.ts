///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * A customer relationship management platform for a `@rapidmx/restapi`-based mail server: shared workspaces of contacts and
 * companies with custom properties, tags, notes, tasks, an activity timeline, filtered search and CSV import and export.
 *
 * This module exports only the backend-agnostic surface: the entity interfaces, the filter engine, the utilities and the abstract
 * routes and jobs. The concrete Mongo/SQL classes a server loads come from this package's `./mongo` and `./sql` entry points.
 */
export * from "./models/types.js";
export * from "./models/CrmModelClasses.js";
export * from "./filters/Filter.js";
export * from "./filters/fields.js";
export * from "./util/Csv.js";
export * from "./util/ImportMapping.js";
export * from "./util/PropertyValues.js";
export * from "./util/Validation.js";
export * from "./util/WorkspaceAccess.js";
export * from "./routes/CrmRouteBase.js";
export * from "./routes/BaseWorkspaceRoute.js";
export * from "./routes/BaseWorkspaceRecordRoute.js";
export * from "./routes/BaseTaggedRecordRoute.js";
export * from "./routes/BaseContactRoute.js";
export * from "./routes/BaseCompanyRoute.js";
export * from "./routes/BasePropertyDefinitionRoute.js";
export * from "./routes/BaseNoteRoute.js";
export * from "./routes/BaseTaskRoute.js";
export * from "./routes/BaseTimelineRoute.js";
export * from "./routes/BaseImportRoute.js";
export * from "./jobs/CrmImportJob.js";
