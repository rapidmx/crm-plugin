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
export { MailingListSQL } from "./models/sql/MailingListSQL.js";
export { SubscriptionSQL } from "./models/sql/SubscriptionSQL.js";
export { SuppressionSQL } from "./models/sql/SuppressionSQL.js";
export { CrmFormSQL } from "./models/sql/CrmFormSQL.js";
export { CrmSettingSQL } from "./models/sql/CrmSettingSQL.js";
export { EmailTemplateSQL } from "./models/sql/EmailTemplateSQL.js";
export { SavedBlockSQL } from "./models/sql/SavedBlockSQL.js";
export { WorkspaceRouteSQL } from "./routes/sql/WorkspaceRouteSQL.js";
export { ContactRouteSQL } from "./routes/sql/ContactRouteSQL.js";
export { CompanyRouteSQL } from "./routes/sql/CompanyRouteSQL.js";
export { PropertyDefinitionRouteSQL } from "./routes/sql/PropertyDefinitionRouteSQL.js";
export { NoteRouteSQL } from "./routes/sql/NoteRouteSQL.js";
export { TaskRouteSQL } from "./routes/sql/TaskRouteSQL.js";
export { TimelineRouteSQL } from "./routes/sql/TimelineRouteSQL.js";
export { ImportRouteSQL } from "./routes/sql/ImportRouteSQL.js";
export { ListRouteSQL } from "./routes/sql/ListRouteSQL.js";
export { SubscriptionRouteSQL } from "./routes/sql/SubscriptionRouteSQL.js";
export { SuppressionRouteSQL } from "./routes/sql/SuppressionRouteSQL.js";
export { FormRouteSQL } from "./routes/sql/FormRouteSQL.js";
export { PublicRouteSQL } from "./routes/sql/PublicRouteSQL.js";
export { TemplateRouteSQL } from "./routes/sql/TemplateRouteSQL.js";
export { SavedBlockRouteSQL } from "./routes/sql/SavedBlockRouteSQL.js";
export { CrmImportJobSQL } from "./jobs/sql/CrmImportJobSQL.js";
