// Re-exports the model classes the CRM routes read and write, so the test Server's ClassLoader (rooted at `test/server-mongo`) discovers
// their `@DataStore` metadata. Named, not wildcard: `@rapidmx/restapi/mongo` and this plugin's `./mongo` entry point also export routes and
// jobs, which the ClassLoader would otherwise mount and start too.
export { MailboxMongo } from "@rapidmx/restapi/mongo";
export { WorkspaceMongo } from "../../../src/models/mongo/WorkspaceMongo.js";
export { WorkspaceMemberMongo } from "../../../src/models/mongo/WorkspaceMemberMongo.js";
export { WorkspaceSenderMongo } from "../../../src/models/mongo/WorkspaceSenderMongo.js";
export { CrmContactMongo } from "../../../src/models/mongo/CrmContactMongo.js";
export { CrmCompanyMongo } from "../../../src/models/mongo/CrmCompanyMongo.js";
export { PropertyDefinitionMongo } from "../../../src/models/mongo/PropertyDefinitionMongo.js";
export { PropertyValueMongo } from "../../../src/models/mongo/PropertyValueMongo.js";
export { CrmNoteMongo } from "../../../src/models/mongo/CrmNoteMongo.js";
export { CrmTaskMongo } from "../../../src/models/mongo/CrmTaskMongo.js";
export { TimelineEventMongo } from "../../../src/models/mongo/TimelineEventMongo.js";
export { CrmImportMongo } from "../../../src/models/mongo/CrmImportMongo.js";
export { MailingListMongo } from "../../../src/models/mongo/MailingListMongo.js";
export { SubscriptionMongo } from "../../../src/models/mongo/SubscriptionMongo.js";
export { SuppressionMongo } from "../../../src/models/mongo/SuppressionMongo.js";
export { CrmFormMongo } from "../../../src/models/mongo/CrmFormMongo.js";
export { CrmSettingMongo } from "../../../src/models/mongo/CrmSettingMongo.js";
export { EmailTemplateMongo } from "../../../src/models/mongo/EmailTemplateMongo.js";
export { SavedBlockMongo } from "../../../src/models/mongo/SavedBlockMongo.js";
export { CampaignMongo } from "../../../src/models/mongo/CampaignMongo.js";
export { OutboundSendMongo } from "../../../src/models/mongo/OutboundSendMongo.js";
export { EngagementEventMongo } from "../../../src/models/mongo/EngagementEventMongo.js";
export { SegmentMongo } from "../../../src/models/mongo/SegmentMongo.js";
export { ScoringRuleMongo } from "../../../src/models/mongo/ScoringRuleMongo.js";
export { AutomationMongo } from "../../../src/models/mongo/AutomationMongo.js";
export { AutomationVersionMongo } from "../../../src/models/mongo/AutomationVersionMongo.js";
export { EnrollmentMongo } from "../../../src/models/mongo/EnrollmentMongo.js";
export { CrmEventMongo } from "../../../src/models/mongo/CrmEventMongo.js";
export { PipelineMongo } from "../../../src/models/mongo/PipelineMongo.js";
export { DealMongo } from "../../../src/models/mongo/DealMongo.js";
