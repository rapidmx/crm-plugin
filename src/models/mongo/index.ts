///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { MailboxMongo } from "@rapidmx/restapi/mongo";
import type { CrmModelClasses } from "../CrmModelClasses.js";
import { AutomationMongo } from "./AutomationMongo.js";
import { AutomationVersionMongo } from "./AutomationVersionMongo.js";
import { CampaignMongo } from "./CampaignMongo.js";
import { CrmCompanyMongo } from "./CrmCompanyMongo.js";
import { CrmContactMongo } from "./CrmContactMongo.js";
import { CrmEventMongo } from "./CrmEventMongo.js";
import { CrmFormMongo } from "./CrmFormMongo.js";
import { CrmImportMongo } from "./CrmImportMongo.js";
import { CrmNoteMongo } from "./CrmNoteMongo.js";
import { CrmSettingMongo } from "./CrmSettingMongo.js";
import { CrmTaskMongo } from "./CrmTaskMongo.js";
import { DealMongo } from "./DealMongo.js";
import { EmailTemplateMongo } from "./EmailTemplateMongo.js";
import { EngagementEventMongo } from "./EngagementEventMongo.js";
import { EnrollmentMongo } from "./EnrollmentMongo.js";
import { MailingListMongo } from "./MailingListMongo.js";
import { OutboundSendMongo } from "./OutboundSendMongo.js";
import { PipelineMongo } from "./PipelineMongo.js";
import { PropertyDefinitionMongo } from "./PropertyDefinitionMongo.js";
import { PropertyValueMongo } from "./PropertyValueMongo.js";
import { SavedBlockMongo } from "./SavedBlockMongo.js";
import { ScoringRuleMongo } from "./ScoringRuleMongo.js";
import { SegmentMongo } from "./SegmentMongo.js";
import { SubscriptionMongo } from "./SubscriptionMongo.js";
import { SuppressionMongo } from "./SuppressionMongo.js";
import { TimelineEventMongo } from "./TimelineEventMongo.js";
import { WorkspaceMongo } from "./WorkspaceMongo.js";
import { WorkspaceMemberMongo } from "./WorkspaceMemberMongo.js";
import { WorkspaceSenderMongo } from "./WorkspaceSenderMongo.js";

/** The concrete Mongo classes of every model the CRM routes and jobs use. */
export const MONGO_MODELS: CrmModelClasses = {
    workspace: WorkspaceMongo,
    workspaceMember: WorkspaceMemberMongo,
    workspaceSender: WorkspaceSenderMongo,
    contact: CrmContactMongo,
    company: CrmCompanyMongo,
    propertyDefinition: PropertyDefinitionMongo,
    propertyValue: PropertyValueMongo,
    note: CrmNoteMongo,
    task: CrmTaskMongo,
    timelineEvent: TimelineEventMongo,
    import: CrmImportMongo,
    mailingList: MailingListMongo,
    subscription: SubscriptionMongo,
    suppression: SuppressionMongo,
    form: CrmFormMongo,
    setting: CrmSettingMongo,
    template: EmailTemplateMongo,
    savedBlock: SavedBlockMongo,
    campaign: CampaignMongo,
    outboundSend: OutboundSendMongo,
    engagementEvent: EngagementEventMongo,
    segment: SegmentMongo,
    scoringRule: ScoringRuleMongo,
    automation: AutomationMongo,
    automationVersion: AutomationVersionMongo,
    enrollment: EnrollmentMongo,
    crmEvent: CrmEventMongo,
    pipeline: PipelineMongo,
    deal: DealMongo,
    mailbox: MailboxMongo,
};
