///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * This plugin's `./sql` entry point: exactly the classes a server host loads for a SQL deployment - the CRM models, the routes
 * mounted under `/api/mail/crm`, and the background jobs. Anything else exported here would be registered (and a job started) by
 * the host too, so the abstract routes and utilities stay in the package root.
 */
export { WorkspaceSQL } from "./models/sql/WorkspaceSQL.js";
export { WorkspaceMemberSQL } from "./models/sql/WorkspaceMemberSQL.js";
export { WorkspaceSenderSQL } from "./models/sql/WorkspaceSenderSQL.js";
export { CrmContactSQL } from "./models/sql/CrmContactSQL.js";
export { CrmCompanySQL } from "./models/sql/CrmCompanySQL.js";
export { PropertyDefinitionSQL } from "./models/sql/PropertyDefinitionSQL.js";
export { PropertyValueSQL } from "./models/sql/PropertyValueSQL.js";
export { CrmNoteSQL } from "./models/sql/CrmNoteSQL.js";
export { CrmTaskSQL } from "./models/sql/CrmTaskSQL.js";
export { TimelineEventSQL } from "./models/sql/TimelineEventSQL.js";
export { CrmImportSQL } from "./models/sql/CrmImportSQL.js";
export { WorkspaceRouteSQL } from "./routes/sql/WorkspaceRouteSQL.js";
export { ContactRouteSQL } from "./routes/sql/ContactRouteSQL.js";
export { CompanyRouteSQL } from "./routes/sql/CompanyRouteSQL.js";
export { PropertyDefinitionRouteSQL } from "./routes/sql/PropertyDefinitionRouteSQL.js";
export { NoteRouteSQL } from "./routes/sql/NoteRouteSQL.js";
export { TaskRouteSQL } from "./routes/sql/TaskRouteSQL.js";
export { TimelineRouteSQL } from "./routes/sql/TimelineRouteSQL.js";
export { ImportRouteSQL } from "./routes/sql/ImportRouteSQL.js";
export { CrmImportJobSQL } from "./jobs/sql/CrmImportJobSQL.js";
