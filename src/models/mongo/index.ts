///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { MailboxMongo } from "@rapidmx/restapi/mongo";
import type { CrmModelClasses } from "../CrmModelClasses.js";
import { CrmCompanyMongo } from "./CrmCompanyMongo.js";
import { CrmContactMongo } from "./CrmContactMongo.js";
import { CrmFormMongo } from "./CrmFormMongo.js";
import { CrmImportMongo } from "./CrmImportMongo.js";
import { CrmNoteMongo } from "./CrmNoteMongo.js";
import { CrmSettingMongo } from "./CrmSettingMongo.js";
import { CrmTaskMongo } from "./CrmTaskMongo.js";
import { MailingListMongo } from "./MailingListMongo.js";
import { PropertyDefinitionMongo } from "./PropertyDefinitionMongo.js";
import { PropertyValueMongo } from "./PropertyValueMongo.js";
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
    mailbox: MailboxMongo,
};
