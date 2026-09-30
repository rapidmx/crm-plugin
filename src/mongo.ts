///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * This plugin's `./mongo` entry point: exactly the classes a server host loads for a Mongo deployment - the CRM models, the routes
 * mounted under `/api/mail/crm`, and the background jobs. Anything else exported here would be registered (and a job started) by
 * the host too, so the abstract routes and utilities stay in the package root.
 */
export { WorkspaceMongo } from "./models/mongo/WorkspaceMongo.js";
export { WorkspaceMemberMongo } from "./models/mongo/WorkspaceMemberMongo.js";
export { WorkspaceSenderMongo } from "./models/mongo/WorkspaceSenderMongo.js";
export { CrmContactMongo } from "./models/mongo/CrmContactMongo.js";
export { CrmCompanyMongo } from "./models/mongo/CrmCompanyMongo.js";
export { PropertyDefinitionMongo } from "./models/mongo/PropertyDefinitionMongo.js";
export { PropertyValueMongo } from "./models/mongo/PropertyValueMongo.js";
export { CrmNoteMongo } from "./models/mongo/CrmNoteMongo.js";
export { CrmTaskMongo } from "./models/mongo/CrmTaskMongo.js";
export { TimelineEventMongo } from "./models/mongo/TimelineEventMongo.js";
export { CrmImportMongo } from "./models/mongo/CrmImportMongo.js";
export { MailingListMongo } from "./models/mongo/MailingListMongo.js";
export { SubscriptionMongo } from "./models/mongo/SubscriptionMongo.js";
export { SuppressionMongo } from "./models/mongo/SuppressionMongo.js";
export { CrmFormMongo } from "./models/mongo/CrmFormMongo.js";
export { CrmSettingMongo } from "./models/mongo/CrmSettingMongo.js";
export { EmailTemplateMongo } from "./models/mongo/EmailTemplateMongo.js";
export { SavedBlockMongo } from "./models/mongo/SavedBlockMongo.js";
export { WorkspaceRouteMongo } from "./routes/mongo/WorkspaceRouteMongo.js";
export { ContactRouteMongo } from "./routes/mongo/ContactRouteMongo.js";
export { CompanyRouteMongo } from "./routes/mongo/CompanyRouteMongo.js";
export { PropertyDefinitionRouteMongo } from "./routes/mongo/PropertyDefinitionRouteMongo.js";
export { NoteRouteMongo } from "./routes/mongo/NoteRouteMongo.js";
export { TaskRouteMongo } from "./routes/mongo/TaskRouteMongo.js";
export { TimelineRouteMongo } from "./routes/mongo/TimelineRouteMongo.js";
export { ImportRouteMongo } from "./routes/mongo/ImportRouteMongo.js";
export { ListRouteMongo } from "./routes/mongo/ListRouteMongo.js";
export { SubscriptionRouteMongo } from "./routes/mongo/SubscriptionRouteMongo.js";
export { SuppressionRouteMongo } from "./routes/mongo/SuppressionRouteMongo.js";
export { FormRouteMongo } from "./routes/mongo/FormRouteMongo.js";
export { PublicRouteMongo } from "./routes/mongo/PublicRouteMongo.js";
export { TemplateRouteMongo } from "./routes/mongo/TemplateRouteMongo.js";
export { SavedBlockRouteMongo } from "./routes/mongo/SavedBlockRouteMongo.js";
export { CrmImportJobMongo } from "./jobs/mongo/CrmImportJobMongo.js";
