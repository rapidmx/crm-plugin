///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import config from "../../config.js";
import { ACLAction, ConnectionManager, MongoConnection, MongoRepository, NotificationUtils, ObjectFactory, Server } from "@rapidrest/service-core";
import { JWTUtils, Logger } from "@rapidrest/core";
import * as uuid from "uuid";
import { MailboxMongo } from "@rapidmx/restapi/mongo";
import { MongoMemoryServer } from "mongodb-memory-server";
import { CrmRepos } from "../../../src/models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../../src/models/mongo/index.js";
import { CrmImportJobMongo } from "../../../src/jobs/mongo/CrmImportJobMongo.js";
import { CampaignJobMongo } from "../../../src/jobs/mongo/CampaignJobMongo.js";
import { SendDispatchJobMongo } from "../../../src/jobs/mongo/SendDispatchJobMongo.js";
import { CrmMailEventJobMongo } from "../../../src/jobs/mongo/CrmMailEventJobMongo.js";
import { SegmentRefreshJobMongo } from "../../../src/jobs/mongo/SegmentRefreshJobMongo.js";
import { ScoringJobMongo } from "../../../src/jobs/mongo/ScoringJobMongo.js";
import { AutomationTriggerJobMongo } from "../../../src/jobs/mongo/AutomationTriggerJobMongo.js";
import { AutomationRunJobMongo } from "../../../src/jobs/mongo/AutomationRunJobMongo.js";
import { TaskReminderJobMongo } from "../../../src/jobs/mongo/TaskReminderJobMongo.js";
import { registerTestDoubles, type InMemoryBlobStore, type RecordingMailTransport } from "../../testDoubles.js";
import { CrmTestContext, TestUser } from "../context.js";
import { runCrmSuites } from "../suites.js";

const mongod: MongoMemoryServer = new MongoMemoryServer({ instance: { port: 9999, dbName: "rrst-test" } });

describe("CRM routes (Mongo)", () => {
    const logger = Logger();
    const objectFactory: ObjectFactory = new ObjectFactory(config, logger);
    const server: Server = new Server({ config, basePath: "./test/server-mongo", logger, objectFactory });
    let aclRepo: MongoRepository<any>;
    let mongo: MongoConnection;
    let pushed: { uids: string[]; type: string; action: string; data: any }[] = [];

    const user = (roles: string[] = []): TestUser => {
        const uid: string = uuid.v4();
        return { uid, token: JWTUtils.createTokenSync(config.get("auth"), { uid, roles, elevated: Date.now() }) };
    };
    const users = { owner: user(), editor: user(), viewer: user(), stranger: user(), admin: user(["admin"]) };

    beforeAll(async () => {
        await mongod.start();
        registerTestDoubles(objectFactory);
        await server.start();
        const connections: ConnectionManager | undefined = objectFactory.getInstance(ConnectionManager);
        aclRepo = (connections?.connections.get("acl") as MongoConnection).getMongoRepository("AccessControlListMongo");
        mongo = connections?.connections.get("mongo") as MongoConnection;
    });

    afterAll(async () => {
        await server.stop();
        await mongod.stop();
        await objectFactory.destroy();
    });

    beforeEach(async () => {
        for (const modelClass of Object.values(MONGO_MODELS)) {
            try {
                await mongo.getMongoRepository(modelClass.name).clear();
            } catch (err: any) {
                if (err.message !== "ns not found") {
                    throw err;
                }
            }
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

    const repos = new CrmRepos(objectFactory, MONGO_MODELS);
    const ctx: CrmTestContext = {
        app: () => server.getApplication(),
        prefix: "/mongo/crm",
        users,
        createMailbox: async (ownerUid, address, grants) => {
            const mailbox = await mongo.getMongoRepository(MailboxMongo.name).save(
                new MailboxMongo({
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
            // Access records outlive the per-test clean-up, and a mailbox's uid is its address: replace any earlier one.
            await aclRepo.deleteMany({ uid: mailbox.uid });
            await aclRepo.save({
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
        importJob: async () => await objectFactory.newInstance(CrmImportJobMongo, { name: `import-${uuid.v4()}` }),
        job: async (name) =>
            await objectFactory.newInstance({ campaign: CampaignJobMongo, send: SendDispatchJobMongo, events: CrmMailEventJobMongo, segments: SegmentRefreshJobMongo, scoring: ScoringJobMongo, triggers: AutomationTriggerJobMongo, automations: AutomationRunJobMongo, reminders: TaskReminderJobMongo }[name], { name: `${name}-${uuid.v4()}` }),
        repo: async (name: string) => await repos.get(name as any),
        pushed: () => pushed,
        route: (name: string) => objectFactory.getInstance(`routes.${name}`),
        transport: () => objectFactory.getInstance<RecordingMailTransport>("MailTransport") as RecordingMailTransport,
    };

    runCrmSuites(ctx);
});
