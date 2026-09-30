///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import config from "../../config.sql.js";
import { ACLAction, AccessControlListSQL, ConnectionManager, NotificationUtils, ObjectFactory, Server, isSqlDataSource } from "@rapidrest/service-core";
import { JWTUtils, Logger } from "@rapidrest/core";
import * as uuid from "uuid";
import { MailboxSQL } from "@rapidmx/restapi/sql";
import { CrmRepos } from "../../../src/models/CrmModelClasses.js";
import { SQL_MODELS } from "../../../src/models/sql/index.js";
import { CrmImportJobSQL } from "../../../src/jobs/sql/CrmImportJobSQL.js";
import { CampaignJobSQL } from "../../../src/jobs/sql/CampaignJobSQL.js";
import { SendDispatchJobSQL } from "../../../src/jobs/sql/SendDispatchJobSQL.js";
import { CrmMailEventJobSQL } from "../../../src/jobs/sql/CrmMailEventJobSQL.js";
import { registerTestDoubles, type InMemoryBlobStore, type RecordingMailTransport } from "../../testDoubles.js";
import { CrmTestContext, TestUser } from "../context.js";
import { runCrmSuites } from "../suites.js";

describe("CRM routes (SQL)", () => {
    const logger = Logger();
    const objectFactory: ObjectFactory = new ObjectFactory(config, logger);
    const server: Server = new Server({ config, basePath: "./test/server-sql", logger, objectFactory });
    let acl: any;
    let sql: any;
    let pushed: { uids: string[]; type: string; action: string; data: any }[] = [];

    const user = (roles: string[] = []): TestUser => {
        const uid: string = uuid.v4();
        return { uid, token: JWTUtils.createTokenSync(config.get("auth"), { uid, roles, elevated: Date.now() }) };
    };
    const users = { owner: user(), editor: user(), viewer: user(), stranger: user(), admin: user(["admin"]) };

    beforeAll(async () => {
        registerTestDoubles(objectFactory);
        await server.start();
        const connections: ConnectionManager | undefined = objectFactory.getInstance(ConnectionManager);
        acl = connections?.connections.get("acl");
        sql = connections?.connections.get("sql");
        if (!isSqlDataSource(acl) || !isSqlDataSource(sql)) {
            throw new Error("Could not find the SQL connections");
        }
    });

    afterAll(async () => {
        await server.stop();
        await objectFactory.destroy();
    });

    beforeEach(async () => {
        for (const modelClass of Object.values(SQL_MODELS)) {
            await sql.getRepository(modelClass).clear();
        }
        pushed = [];
        vi.spyOn(NotificationUtils.prototype, "sendMessage").mockImplementation((uids: any, type: any, action: any, data: any) => {
            pushed.push({ uids: Array.isArray(uids) ? uids : [uids], type, action, data });
        });
        (objectFactory.getInstance<InMemoryBlobStore>("BlobStore") as InMemoryBlobStore).blobs.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const repos = new CrmRepos(objectFactory, SQL_MODELS);
    const ctx: CrmTestContext = {
        app: () => server.getApplication(),
        prefix: "/sql/crm",
        users,
        createMailbox: async (ownerUid, address, grants) => {
            const mailbox = await sql.getRepository(MailboxSQL).save(
                new MailboxSQL({
                    uid: address,
                    ownerUserUid: ownerUid,
                    primarySmtpAddress: address,
                    aliasAddresses: [],
                    displayName: `Mailbox of ${address}`,
                    timezone: "UTC",
                    quotaBytes: 1_000_000_000,
                    usedBytes: 0,
                }),
            );
            await acl.getRepository(AccessControlListSQL).save({
                uid: mailbox.uid,
                dateCreated: new Date(),
                dateModified: new Date(),
                version: 0,
                records: grants ?? [{ userOrRoleId: ownerUid, actions: [ACLAction.FULL] }],
                parentUid: "Mailbox",
            });
            return { uid: mailbox.uid };
        },
        blobStore: () => objectFactory.getInstance<InMemoryBlobStore>("BlobStore") as InMemoryBlobStore,
        importJob: async () => await objectFactory.newInstance(CrmImportJobSQL, { name: `import-${uuid.v4()}` }),
        job: async (name) =>
            await objectFactory.newInstance({ campaign: CampaignJobSQL, send: SendDispatchJobSQL, events: CrmMailEventJobSQL }[name], { name: `${name}-${uuid.v4()}` }),
        repo: async (name: string) => await repos.get(name as any),
        pushed: () => pushed,
        route: (name: string) => objectFactory.getInstance(`routes.${name}`),
        transport: () => objectFactory.getInstance<RecordingMailTransport>("MailTransport") as RecordingMailTransport,
    };

    runCrmSuites(ctx);
});
