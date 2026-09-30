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
    ["CrmTask", "crm_task", "CrmTask", ["crm_task_workspace_status_due", "crm_task_workspace_assignee", "crm_task_subject"], false],
    ["TimelineEvent", "timeline_event", "CrmTimelineEvent", ["crm_timeline_subject"], false],
    ["CrmImport", "crm_import", "CrmImport", ["crm_import_workspace", "crm_import_status"], false],
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
];

describe("plugin entry points", () => {
    it.each([
        ["mongo", MongoEntry, "Mongo", "mongo"],
        ["sql", SqlEntry, "SQL", "sql"],
    ])("./%s exports only the mounted routes, the models and the import job", (_name, entry, suffix, datastore) => {
        const expected: Record<string, string> = { [`CrmImportJob${suffix}`]: "job" };
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
    it("declares a valid manifest with the CRM app on the app rail", () => {
        const manifest: any = parsePluginManifest(pkg);
        expect(typeof manifest).toBe("object");
        expect(manifest).toEqual(expect.objectContaining({ displayName: "CRM", mailboxScopedData: true }));
        expect(manifest.ui.apps).toEqual([{ id: "crm", host: "www", mount: "/crm", dir: "apps/crm" }]);
        expect(manifest.ui.appRail).toEqual([{ id: "crm", label: "CRM", href: "/crm", icon: "HiOutlineUserGroup" }]);
        expect(manifest.settings.map((setting: any) => setting.key)).toEqual(["mail:crm:workspace_creator_roles", "mail:crm:max_workspaces_per_user"]);
    });

    it("ships every UI app's sources, with a layout, in the package", () => {
        expect(pkg.files).toEqual(expect.arrayContaining(["apps", "dist"]));
        for (const app of pkg.rapidmx.plugin.ui.apps) {
            expect(fs.existsSync(new URL(`../${app.dir}/_layout.tsx`, import.meta.url))).toBe(true);
            expect(fs.existsSync(new URL(`../${app.dir}/index.tsx`, import.meta.url))).toBe(true);
        }
    });
});
