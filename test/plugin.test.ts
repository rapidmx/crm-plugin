///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// The plugin contract: a server host registers every export of `./mongo`/`./sql` and mounts, connects or starts it, so each entry
// point must export only ready routes, models and jobs, and package.json must carry a valid manifest whose UI apps point at
// directories this package actually ships. The entity names, index names and ACL uids pinned here are the data contract: renaming
// any of them orphans an existing deployment's data.
import "reflect-metadata";
import fs from "fs";
import { BackgroundService, PersistenceDecorators } from "@rapidrest/service-core";
import { isMailboxScopedData, parsePluginManifest } from "@rapidmx/restapi";
import * as MongoEntry from "../src/mongo.js";
import * as SqlEntry from "../src/sql.js";

function describeExport(clazz: any): string {
    if (Reflect.getMetadata("rrst:routePaths", clazz.prototype)) {
        return `route ${Reflect.getMetadata("rrst:routePaths", clazz.prototype).join(",")}`;
    }
    if (Reflect.getMetadata("rrst:datasource", clazz)) {
        return `model ${Reflect.getMetadata("rrst:datasource", clazz)}${isMailboxScopedData(clazz) ? " mailbox-scoped" : ""}`;
    }
    if (clazz.prototype instanceof BackgroundService) {
        return "job";
    }
    return "other";
}

const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

/** Every model: its interface name, its entity name stem, ACL uid, index names and whether it has per-record ACLs. */
const MODELS: [string, string, string, string[], boolean][] = [
    ["Workspace", "workspace", "CrmWorkspace", [], true],
    ["WorkspaceMember", "workspace_member", "CrmWorkspaceMember", ["crm_member_workspace_user", "crm_member_user"], false],
    ["WorkspaceSender", "workspace_sender", "CrmWorkspaceSender", ["crm_sender_workspace", "crm_sender_mailbox"], false],
    ["CrmContact", "crm_contact", "CrmContact", ["crm_contact_workspace_email", "crm_contact_workspace_company", "crm_contact_workspace_modified"], false],
    ["CrmCompany", "crm_company", "CrmCompany", ["crm_company_workspace_name", "crm_company_workspace_domain"], false],
    ["PropertyDefinition", "property_definition", "CrmPropertyDefinition", ["crm_propdef_workspace_type_key"], false],
    ["PropertyValue", "property_value", "CrmPropertyValue", ["crm_propval_object_key", "crm_propval_string", "crm_propval_number", "crm_propval_date"], false],
    ["CrmNote", "crm_note", "CrmNote", ["crm_note_subject"], false],
    ["CrmTask", "crm_task", "CrmTask", ["crm_task_workspace_status_due", "crm_task_workspace_assignee", "crm_task_subject", "crm_task_due"], false],
    ["TimelineEvent", "timeline_event", "CrmTimelineEvent", ["crm_timeline_subject"], false],
    ["CrmImport", "crm_import", "CrmImport", ["crm_import_workspace", "crm_import_status"], false],
    ["MailingList", "mailing_list", "CrmMailingList", ["crm_list_workspace_name"], false],
    ["Subscription", "subscription", "CrmSubscription", ["crm_sub_list_contact", "crm_sub_workspace_contact", "crm_sub_list_status"], false],
    ["Suppression", "suppression", "CrmSuppression", ["crm_suppression_workspace_email"], false],
    ["CrmForm", "crm_form", "CrmForm", ["crm_form_workspace"], false],
    ["CrmSetting", "crm_setting", "CrmSetting", ["crm_setting_key"], false],
    ["EmailTemplate", "email_template", "CrmEmailTemplate", ["crm_template_workspace_name"], false],
    ["SavedBlock", "saved_block", "CrmSavedBlock", ["crm_savedblock_workspace"], false],
    ["Campaign", "campaign", "CrmCampaign", ["crm_campaign_workspace", "crm_campaign_status"], false],
    [
        "OutboundSend",
        "outbound_send",
        "CrmOutboundSend",
        ["crm_send_dedupe", "crm_send_token", "crm_send_source", "crm_send_due", "crm_send_message", "crm_send_contact", "crm_send_workspace"],
        false,
    ],
    ["EngagementEvent", "engagement_event", "CrmEngagementEvent", ["crm_engagement_source", "crm_engagement_contact", "crm_engagement_send", "crm_engagement_workspace"], false],
    ["Segment", "segment", "CrmSegment", ["crm_segment_workspace", "crm_segment_refresh"], false],
    ["ScoringRule", "scoring_rule", "CrmScoringRule", ["crm_scoring_workspace"], false],
    ["Automation", "automation", "CrmAutomation", ["crm_automation_workspace"], false],
    ["AutomationVersion", "automation_version", "CrmAutomationVersion", ["crm_automationversion_automation", "crm_automationversion_workspace"], false],
    ["Enrollment", "enrollment", "CrmEnrollment", ["crm_enrollment_due", "crm_enrollment_automation", "crm_enrollment_contact", "crm_enrollment_workspace"], false],
    ["CrmEvent", "crm_event", "CrmEvent", ["crm_event_dispatch", "crm_event_workspace", "crm_event_contact"], false],
    ["Pipeline", "pipeline", "CrmPipeline", ["crm_pipeline_workspace"], false],
    ["Deal", "deal", "CrmDeal", ["crm_deal_pipeline", "crm_deal_workspace", "crm_deal_company"], false],
    ["WebhookEndpoint", "webhook_endpoint", "CrmWebhookEndpoint", ["crm_webhook_workspace"], false],
    ["WebhookDelivery", "webhook_delivery", "CrmWebhookDelivery", ["crm_webhookdelivery_due", "crm_webhookdelivery_endpoint", "crm_webhookdelivery_workspace"], false],
    ["ApiKey", "api_key", "CrmApiKey", ["crm_apikey_hash", "crm_apikey_workspace"], false],
];

const ROUTES: [string, string][] = [
    ["Workspace", "workspaces"],
    ["Contact", "contacts"],
    ["Company", "companies"],
    ["PropertyDefinition", "properties"],
    ["Note", "notes"],
    ["Task", "tasks"],
    ["Timeline", "timeline"],
    ["Import", "imports"],
    ["List", "lists"],
    ["Subscription", "subscriptions"],
    ["Suppression", "suppressions"],
    ["Form", "forms"],
    ["Public", "public"],
    ["Template", "templates"],
    ["SavedBlock", "saved-blocks"],
    ["Campaign", "campaigns"],
    ["Tracking", "t"],
    ["Segment", "segments"],
    ["ScoringRule", "scoring-rules"],
    ["Automation", "automations"],
    ["Pipeline", "pipelines"],
    ["Deal", "deals"],
    ["Analytics", "analytics"],
    ["Webhook", "webhooks"],
    ["ApiKey", "api-keys"],
    ["Integration", "integrations"],
    ["CrmAdmin", "admin"],
];

describe("plugin entry points", () => {
    it.each([
        ["mongo", MongoEntry, "Mongo", "mongo"],
        ["sql", SqlEntry, "SQL", "sql"],
    ])("./%s exports only the mounted routes, the models and the import job", (_name, entry, suffix, datastore) => {
        const expected: Record<string, string> = {
            [`CrmImportJob${suffix}`]: "job",
            [`CampaignJob${suffix}`]: "job",
            [`SendDispatchJob${suffix}`]: "job",
            [`CrmMailEventJob${suffix}`]: "job",
            [`SegmentRefreshJob${suffix}`]: "job",
            [`ScoringJob${suffix}`]: "job",
            [`AutomationTriggerJob${suffix}`]: "job",
            [`AutomationRunJob${suffix}`]: "job",
            [`TaskReminderJob${suffix}`]: "job",
            [`WebhookDeliveryJob${suffix}`]: "job",
        };
        for (const [model] of MODELS) {
            expected[`${model}${suffix}`] = `model ${datastore}${model === "WorkspaceSender" ? " mailbox-scoped" : ""}`;
        }
        for (const [route, path] of ROUTES) {
            expected[`${route}Route${suffix}`] = `route /api/mail/crm/${path}`;
        }
        expect(Object.fromEntries(Object.entries(entry).map(([name, clazz]) => [name, describeExport(clazz)]))).toEqual(expected);
    });

    it("keeps the entity names, index names and ACL uids of every model", () => {
        for (const [entry, suffix] of [
            [MongoEntry, "Mongo"],
            [SqlEntry, "SQL"],
        ] as const) {
            for (const [model, stem, acl, indexes, recordAcl] of MODELS) {
                const clazz: any = (entry as any)[`${model}${suffix}`];
                expect(Reflect.getMetadata("rrst:entityName", clazz)).toBe(`${stem}_${suffix.toLowerCase()}`);
                expect(Reflect.getMetadata("rrst:classACL", clazz).uid).toBe(acl);
                expect(!!clazz.recordACL).toBe(recordAcl);
                const names: string[] = PersistenceDecorators.getIndexMetadata(clazz).map((index: any) => index.name);
                // `uid` and `uid_version` come from the base entity.
                expect(names.filter((name) => name !== "uid" && name !== "uid_version").sort()).toEqual([...indexes].sort());
            }
        }
    });
});

describe("plugin manifest", () => {
    it("declares a valid manifest with the CRM app on the app rail and in the admin console", () => {
        const manifest: any = parsePluginManifest(pkg);
        expect(typeof manifest).toBe("object");
        expect(manifest).toEqual(expect.objectContaining({ displayName: "CRM", mailboxScopedData: true }));
        expect(manifest.ui.apps).toEqual([
            { id: "crm", host: "www", mount: "/crm", dir: "apps/crm" },
            { id: "subscriptions", host: "public", mount: "/subscriptions", dir: "apps/subscriptions" },
            { id: "forms", host: "public", mount: "/f", dir: "apps/f" },
            { id: "crm-admin", host: "admin", mount: "/admin/crm", dir: "apps/admin-crm" },
        ]);
        expect(manifest.ui.appRail).toEqual([{ id: "crm", label: "CRM", href: "/crm", icon: "HiOutlineUserGroup" }]);
        expect(manifest.ui.adminNav).toEqual([{ id: "crm", label: "CRM", href: "/admin/crm", icon: "HiOutlineUserGroup" }]);
        expect(manifest.settings.map((setting: any) => setting.key)).toEqual([
            "mail:crm:public_url",
            "mail:crm:workspace_creator_roles",
            "mail:crm:max_workspaces_per_user",
            "mail:crm:send_rate_per_minute",
            "mail:crm:verp",
        ]);
        expect(manifest.settings[0].default).toBe("https://<host>");
    });

    it("ships every UI app's sources, with a layout, in the package", () => {
        expect(pkg.files).toEqual(expect.arrayContaining(["apps", "dist"]));
        for (const app of pkg.rapidmx.plugin.ui.apps) {
            expect(fs.existsSync(new URL(`../${app.dir}/_layout.tsx`, import.meta.url))).toBe(true);
            expect(fs.existsSync(new URL(`../${app.dir}/index.tsx`, import.meta.url))).toBe(true);
        }
    });
});
