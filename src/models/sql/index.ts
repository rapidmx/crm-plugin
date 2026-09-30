///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { MailboxSQL } from "@rapidmx/restapi/sql";
import type { CrmModelClasses } from "../CrmModelClasses.js";
import { CampaignSQL } from "./CampaignSQL.js";
import { CrmCompanySQL } from "./CrmCompanySQL.js";
import { CrmContactSQL } from "./CrmContactSQL.js";
import { CrmFormSQL } from "./CrmFormSQL.js";
import { CrmImportSQL } from "./CrmImportSQL.js";
import { CrmNoteSQL } from "./CrmNoteSQL.js";
import { CrmSettingSQL } from "./CrmSettingSQL.js";
import { CrmTaskSQL } from "./CrmTaskSQL.js";
import { EmailTemplateSQL } from "./EmailTemplateSQL.js";
import { EngagementEventSQL } from "./EngagementEventSQL.js";
import { MailingListSQL } from "./MailingListSQL.js";
import { OutboundSendSQL } from "./OutboundSendSQL.js";
import { PropertyDefinitionSQL } from "./PropertyDefinitionSQL.js";
import { PropertyValueSQL } from "./PropertyValueSQL.js";
import { SavedBlockSQL } from "./SavedBlockSQL.js";
import { ScoringRuleSQL } from "./ScoringRuleSQL.js";
import { SegmentSQL } from "./SegmentSQL.js";
import { SubscriptionSQL } from "./SubscriptionSQL.js";
import { SuppressionSQL } from "./SuppressionSQL.js";
import { TimelineEventSQL } from "./TimelineEventSQL.js";
import { WorkspaceSQL } from "./WorkspaceSQL.js";
import { WorkspaceMemberSQL } from "./WorkspaceMemberSQL.js";
import { WorkspaceSenderSQL } from "./WorkspaceSenderSQL.js";

/** The concrete SQL classes of every model the CRM routes and jobs use. */
export const SQL_MODELS: CrmModelClasses = {
    workspace: WorkspaceSQL,
    workspaceMember: WorkspaceMemberSQL,
    workspaceSender: WorkspaceSenderSQL,
    contact: CrmContactSQL,
    company: CrmCompanySQL,
    propertyDefinition: PropertyDefinitionSQL,
    propertyValue: PropertyValueSQL,
    note: CrmNoteSQL,
    task: CrmTaskSQL,
    timelineEvent: TimelineEventSQL,
    import: CrmImportSQL,
    mailingList: MailingListSQL,
    subscription: SubscriptionSQL,
    suppression: SuppressionSQL,
    form: CrmFormSQL,
    setting: CrmSettingSQL,
    template: EmailTemplateSQL,
    savedBlock: SavedBlockSQL,
    campaign: CampaignSQL,
    outboundSend: OutboundSendSQL,
    engagementEvent: EngagementEventSQL,
    segment: SegmentSQL,
    scoringRule: ScoringRuleSQL,
    mailbox: MailboxSQL,
};
