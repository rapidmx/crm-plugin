///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * A customer relationship management platform for a `@rapidmx/restapi`-based mail server: shared workspaces of contacts and
 * companies with custom properties, tags, notes, tasks, an activity timeline, filtered search and CSV import and export; mailing
 * lists, subscriptions with double opt-in, suppressions, signup forms and a subscriber preference center.
 *
 * This module exports only the backend-agnostic surface: the entity interfaces, the filter engine, the utilities and the abstract
 * routes and jobs. The concrete Mongo/SQL classes a server loads come from this package's `./mongo` and `./sql` entry points.
 */
export * from "./models/types.js";
export * from "./models/CrmModelClasses.js";
export * from "./filters/Filter.js";
export * from "./filters/fields.js";
export * from "./util/Csv.js";
export * from "./util/Mailer.js";
export * from "./util/Tokens.js";
export * from "./util/Secrets.js";
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
export * from "./routes/BaseListRoute.js";
export * from "./routes/BaseSubscriptionRoute.js";
export * from "./routes/BaseSuppressionRoute.js";
export * from "./routes/BaseFormRoute.js";
export * from "./routes/BasePublicRoute.js";
export * from "./routes/BaseTemplateRoute.js";
export * from "./routes/BaseSavedBlockRoute.js";
export * from "./routes/BaseCampaignRoute.js";
export * from "./routes/BaseTrackingRoute.js";
export * from "./routes/BaseSegmentRoute.js";
export * from "./routes/BaseScoringRuleRoute.js";
export * from "./routes/BaseAutomationRoute.js";
export * from "./automation/Events.js";
export * from "./automation/Graph.js";
export * from "./automation/Engine.js";
export * from "./segments/Segments.js";
export * from "./scoring/Scoring.js";
export * from "./sending/Audience.js";
export * from "./sending/CampaignRenderer.js";
export * from "./sending/Engagement.js";
export * from "./sending/Stats.js";
export * from "./sending/Tracking.js";
export * from "./templates/Design.js";
export * from "./templates/MergeContext.js";
export * from "./templates/Render.js";
export * from "./templates/Sanitize.js";
export * from "./jobs/CrmImportJob.js";
export * from "./jobs/CrmJobBase.js";
export * from "./jobs/CampaignJob.js";
export * from "./jobs/SendDispatchJob.js";
export * from "./jobs/CrmMailEventJob.js";
export * from "./jobs/SegmentRefreshJob.js";
export * from "./jobs/ScoringJob.js";
export * from "./jobs/AutomationTriggerJob.js";
export * from "./jobs/AutomationRunJob.js";
