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
export { CampaignMongo } from "./models/mongo/CampaignMongo.js";
export { OutboundSendMongo } from "./models/mongo/OutboundSendMongo.js";
export { EngagementEventMongo } from "./models/mongo/EngagementEventMongo.js";
export { SegmentMongo } from "./models/mongo/SegmentMongo.js";
export { ScoringRuleMongo } from "./models/mongo/ScoringRuleMongo.js";
export { AutomationMongo } from "./models/mongo/AutomationMongo.js";
export { AutomationVersionMongo } from "./models/mongo/AutomationVersionMongo.js";
export { EnrollmentMongo } from "./models/mongo/EnrollmentMongo.js";
export { CrmEventMongo } from "./models/mongo/CrmEventMongo.js";
export { PipelineMongo } from "./models/mongo/PipelineMongo.js";
export { DealMongo } from "./models/mongo/DealMongo.js";
export { WebhookEndpointMongo } from "./models/mongo/WebhookEndpointMongo.js";
export { WebhookDeliveryMongo } from "./models/mongo/WebhookDeliveryMongo.js";
export { ApiKeyMongo } from "./models/mongo/ApiKeyMongo.js";
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
export { CampaignRouteMongo } from "./routes/mongo/CampaignRouteMongo.js";
export { TrackingRouteMongo } from "./routes/mongo/TrackingRouteMongo.js";
export { SegmentRouteMongo } from "./routes/mongo/SegmentRouteMongo.js";
export { ScoringRuleRouteMongo } from "./routes/mongo/ScoringRuleRouteMongo.js";
export { AutomationRouteMongo } from "./routes/mongo/AutomationRouteMongo.js";
export { PipelineRouteMongo } from "./routes/mongo/PipelineRouteMongo.js";
export { DealRouteMongo } from "./routes/mongo/DealRouteMongo.js";
export { AnalyticsRouteMongo } from "./routes/mongo/AnalyticsRouteMongo.js";
export { WebhookRouteMongo } from "./routes/mongo/WebhookRouteMongo.js";
export { ApiKeyRouteMongo } from "./routes/mongo/ApiKeyRouteMongo.js";
export { IntegrationRouteMongo } from "./routes/mongo/IntegrationRouteMongo.js";
export { CrmAdminRouteMongo } from "./routes/mongo/CrmAdminRouteMongo.js";
export { CrmImportJobMongo } from "./jobs/mongo/CrmImportJobMongo.js";
export { CampaignJobMongo } from "./jobs/mongo/CampaignJobMongo.js";
export { SendDispatchJobMongo } from "./jobs/mongo/SendDispatchJobMongo.js";
export { CrmMailEventJobMongo } from "./jobs/mongo/CrmMailEventJobMongo.js";
export { SegmentRefreshJobMongo } from "./jobs/mongo/SegmentRefreshJobMongo.js";
export { ScoringJobMongo } from "./jobs/mongo/ScoringJobMongo.js";
export { AutomationTriggerJobMongo } from "./jobs/mongo/AutomationTriggerJobMongo.js";
export { AutomationRunJobMongo } from "./jobs/mongo/AutomationRunJobMongo.js";
export { TaskReminderJobMongo } from "./jobs/mongo/TaskReminderJobMongo.js";
export { WebhookDeliveryJobMongo } from "./jobs/mongo/WebhookDeliveryJobMongo.js";
export { DateTriggerJobMongo } from "./jobs/mongo/DateTriggerJobMongo.js";
