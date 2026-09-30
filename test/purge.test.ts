///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// The `./purge` hook a server runs when the plugin is uninstalled with its data: it deletes the uploaded import files kept in the
// BlobStore by their recorded keys, and refuses to let the purge go on when it can't.
import { onPurge, type PurgeContext } from "../src/purge.js";

const mongoModel = { className: "CrmImportMongo", datastore: "mongo", kind: "mongo" as const, name: "crm_import_mongo" };
const sqlModel = { className: "CrmImportSQL", datastore: "sql", kind: "sql" as const, name: "public.crm_import_sql" };
const otherModel = { className: "CrmContactMongo", datastore: "mongo", kind: "mongo" as const, name: "crm_contact_mongo" };

function mongoConnection(rows: Record<string, unknown>[]) {
    const find = vi.fn((_filter: unknown, _options: unknown) => ({ toArray: async () => rows }));
    const collection = vi.fn((_name: string) => ({ find }));
    return { connection: { db: { collection } }, collection, find };
}

function sqlConnection(rows: Record<string, unknown>[], exists: boolean = true) {
    const release = vi.fn(async () => undefined);
    const query = vi.fn(async (_sql: string) => rows);
    const connection = {
        driver: { escape: (name: string) => `"${name}"` },
        createQueryRunner: () => ({ hasTable: async () => exists, release }),
        query,
    };
    return { connection, query, release };
}

function context(connections: Record<string, any>, models: PurgeContext["models"], blobStore?: PurgeContext["blobStore"]): PurgeContext {
    return { models, connection: (name: string) => connections[name], blobStore, logger: { info: vi.fn() } };
}

describe("onPurge", () => {
    it("deletes every import file of the MongoDB and SQL import collections, by its recorded key", async () => {
        const mongo = mongoConnection([{ blobKey: "crm-imports/1" }, { blobKey: "" }, {}]);
        const sql = sqlConnection([{ blobKey: "crm-imports/2" }]);
        const blobStore = { delete: vi.fn(async () => undefined) };
        const ctx = context({ mongo: mongo.connection, sql: sql.connection }, [otherModel, mongoModel, sqlModel], blobStore);

        await onPurge(ctx);

        expect(mongo.collection).toHaveBeenCalledWith("crm_import_mongo");
        expect(mongo.find).toHaveBeenCalledWith({}, { projection: { blobKey: 1 } });
        expect(sql.query).toHaveBeenCalledWith('SELECT "blobKey" FROM "public"."crm_import_sql"');
        expect(sql.release).toHaveBeenCalled();
        expect(blobStore.delete.mock.calls.map(([key]) => key)).toEqual(["crm-imports/1", "crm-imports/2"]);
        expect(ctx.logger!.info).toHaveBeenCalledWith("Deleted 2 CRM import files.");
    });

    it("skips a SQL table that was never created", async () => {
        const sql = sqlConnection([], false);
        const blobStore = { delete: vi.fn(async () => undefined) };

        await onPurge(context({ sql: sql.connection }, [sqlModel], blobStore));

        expect(sql.query).not.toHaveBeenCalled();
        expect(blobStore.delete).not.toHaveBeenCalled();
    });

    it("aborts when there is no BlobStore for the files, or a file can't be deleted", async () => {
        const mongo = mongoConnection([{ blobKey: "crm-imports/1" }, { blobKey: "crm-imports/2" }]);
        await expect(onPurge(context({ mongo: mongo.connection }, [mongoModel]))).rejects.toMatchObject({ name: "AbortPurgeError" });

        const failing = { delete: vi.fn(async (key: string) => (key.endsWith("2") ? Promise.reject(new Error("denied")) : undefined)) };
        await expect(onPurge(context({ mongo: mongo.connection }, [mongoModel], failing))).rejects.toThrow("Could not delete 1 of 2 CRM import files (crm-imports/2: denied)");
    });
});
