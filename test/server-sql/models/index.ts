// Re-exports the model classes the CRM routes read and write, so the test Server's ClassLoader (rooted at `test/server-sql`) discovers
// their `@DataStore` metadata. Named, not wildcard: `@rapidmx/restapi/sql` and this plugin's `./sql` entry point also export routes and
// jobs, which the ClassLoader would otherwise mount and start too.
export { MailboxSQL } from "@rapidmx/restapi/sql";
export { WorkspaceSQL } from "../../../src/models/sql/WorkspaceSQL.js";
export { WorkspaceMemberSQL } from "../../../src/models/sql/WorkspaceMemberSQL.js";
export { WorkspaceSenderSQL } from "../../../src/models/sql/WorkspaceSenderSQL.js";
export { CrmContactSQL } from "../../../src/models/sql/CrmContactSQL.js";
export { CrmCompanySQL } from "../../../src/models/sql/CrmCompanySQL.js";
export { PropertyDefinitionSQL } from "../../../src/models/sql/PropertyDefinitionSQL.js";
export { PropertyValueSQL } from "../../../src/models/sql/PropertyValueSQL.js";
export { CrmNoteSQL } from "../../../src/models/sql/CrmNoteSQL.js";
export { CrmTaskSQL } from "../../../src/models/sql/CrmTaskSQL.js";
export { TimelineEventSQL } from "../../../src/models/sql/TimelineEventSQL.js";
export { CrmImportSQL } from "../../../src/models/sql/CrmImportSQL.js";
export { MailingListSQL } from "../../../src/models/sql/MailingListSQL.js";
export { SubscriptionSQL } from "../../../src/models/sql/SubscriptionSQL.js";
export { SuppressionSQL } from "../../../src/models/sql/SuppressionSQL.js";
export { CrmFormSQL } from "../../../src/models/sql/CrmFormSQL.js";
export { CrmSettingSQL } from "../../../src/models/sql/CrmSettingSQL.js";
export { EmailTemplateSQL } from "../../../src/models/sql/EmailTemplateSQL.js";
export { SavedBlockSQL } from "../../../src/models/sql/SavedBlockSQL.js";
