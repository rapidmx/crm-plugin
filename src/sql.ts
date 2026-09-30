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
export { CampaignSQL } from "./models/sql/CampaignSQL.js";
export { OutboundSendSQL } from "./models/sql/OutboundSendSQL.js";
export { EngagementEventSQL } from "./models/sql/EngagementEventSQL.js";
export { SegmentSQL } from "./models/sql/SegmentSQL.js";
export { ScoringRuleSQL } from "./models/sql/ScoringRuleSQL.js";
export { AutomationSQL } from "./models/sql/AutomationSQL.js";
export { AutomationVersionSQL } from "./models/sql/AutomationVersionSQL.js";
export { EnrollmentSQL } from "./models/sql/EnrollmentSQL.js";
export { CrmEventSQL } from "./models/sql/CrmEventSQL.js";
export { PipelineSQL } from "./models/sql/PipelineSQL.js";
export { DealSQL } from "./models/sql/DealSQL.js";
export { WebhookEndpointSQL } from "./models/sql/WebhookEndpointSQL.js";
export { WebhookDeliverySQL } from "./models/sql/WebhookDeliverySQL.js";
export { ApiKeySQL } from "./models/sql/ApiKeySQL.js";
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
export { CampaignRouteSQL } from "./routes/sql/CampaignRouteSQL.js";
export { TrackingRouteSQL } from "./routes/sql/TrackingRouteSQL.js";
export { SegmentRouteSQL } from "./routes/sql/SegmentRouteSQL.js";
export { ScoringRuleRouteSQL } from "./routes/sql/ScoringRuleRouteSQL.js";
export { AutomationRouteSQL } from "./routes/sql/AutomationRouteSQL.js";
export { PipelineRouteSQL } from "./routes/sql/PipelineRouteSQL.js";
export { DealRouteSQL } from "./routes/sql/DealRouteSQL.js";
export { AnalyticsRouteSQL } from "./routes/sql/AnalyticsRouteSQL.js";
export { WebhookRouteSQL } from "./routes/sql/WebhookRouteSQL.js";
export { ApiKeyRouteSQL } from "./routes/sql/ApiKeyRouteSQL.js";
export { IntegrationRouteSQL } from "./routes/sql/IntegrationRouteSQL.js";
export { CrmAdminRouteSQL } from "./routes/sql/CrmAdminRouteSQL.js";
export { CrmImportJobSQL } from "./jobs/sql/CrmImportJobSQL.js";
export { CampaignJobSQL } from "./jobs/sql/CampaignJobSQL.js";
export { SendDispatchJobSQL } from "./jobs/sql/SendDispatchJobSQL.js";
export { CrmMailEventJobSQL } from "./jobs/sql/CrmMailEventJobSQL.js";
export { SegmentRefreshJobSQL } from "./jobs/sql/SegmentRefreshJobSQL.js";
export { ScoringJobSQL } from "./jobs/sql/ScoringJobSQL.js";
export { AutomationTriggerJobSQL } from "./jobs/sql/AutomationTriggerJobSQL.js";
export { AutomationRunJobSQL } from "./jobs/sql/AutomationRunJobSQL.js";
export { TaskReminderJobSQL } from "./jobs/sql/TaskReminderJobSQL.js";
export { WebhookDeliveryJobSQL } from "./jobs/sql/WebhookDeliveryJobSQL.js";
export { DateTriggerJobSQL } from "./jobs/sql/DateTriggerJobSQL.js";
