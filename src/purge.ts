///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * This plugin's `./purge` entry point: the server runs `onPurge()` when the plugin is uninstalled *with its data*, once no server runs
 * it any more and before it deletes the plugin's collections and tables (which it finds from the models).
 *
 * What those steps can't find is the uploaded import files (`CrmImport.blobKey`, kept in the server's `BlobStore` under
 * `crm-imports/`): the store can't list keys, and the keys are only in the rows the server is about to delete. So this deletes each
 * file by its recorded key first. If one can't be deleted it throws an `AbortPurgeError`, which stops the purge before the rows go -
 * the keys are still there for a retry.
 *
 * Workspace ACLs (one per workspace, keyed by its uid, in the server's ACL store) are left to the server's own ACL cleanup.
 */

/** What the server hands `onPurge()` (structurally; a plugin imports nothing from the server). */
export interface PurgeContext {
    /** The collections and tables this plugin's models use. */
    models: readonly { className: string; datastore: string; kind: "mongo" | "sql"; name: string }[];
    /** The server's connection for a datastore: a service-core `MongoConnection` or a TypeORM `DataSource`. */
    connection(datastore: string): any;
    /** The server's `BlobStore`. */
    blobStore?: { delete(key: string): Promise<void> };
    logger?: { info(message: string): void };
}

/** Recognised by the server by its name, so the plugin needs no copy of the server's class. */
class AbortPurgeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AbortPurgeError";
    }
}

/** The import file keys recorded in one import collection (MongoDB) or table (SQL). */
async function readKeys(connection: any, model: PurgeContext["models"][number]): Promise<string[]> {
    let rows: Record<string, unknown>[];
    if (model.kind === "mongo") {
        rows = await connection.db.collection(model.name).find({}, { projection: { blobKey: 1 } }).toArray();
    } else {
        const runner: any = connection.createQueryRunner();
        try {
            if (!(await runner.hasTable(model.name))) {
                return [];
            }
            const escape = (name: string): string => connection.driver.escape(name);
            const table: string = model.name.split(".").map(escape).join(".");
            rows = await connection.query(`SELECT ${escape("blobKey")} FROM ${table}`);
        } finally {
            await runner.release();
        }
    }
    return rows.map((row) => row.blobKey).filter((key): key is string => typeof key === "string" && key !== "");
}

/** Deletes every import file this plugin stored in the server's `BlobStore`. */
export async function onPurge(ctx: PurgeContext): Promise<void> {
    const keys: string[] = [];
    for (const model of ctx.models.filter((candidate) => /^CrmImport(Mongo|SQL)$/.test(candidate.className))) {
        keys.push(...(await readKeys(ctx.connection(model.datastore), model)));
    }
    if (keys.length > 0 && !ctx.blobStore) {
        throw new AbortPurgeError(`${keys.length} CRM import files are stored, but the server has no BlobStore to delete them from.`);
    }
    const failed: string[] = [];
    for (const key of keys) {
        try {
            await ctx.blobStore!.delete(key);
        } catch (err: any) {
            failed.push(`${key}: ${err.message}`);
        }
    }
    if (failed.length > 0) {
        throw new AbortPurgeError(`Could not delete ${failed.length} of ${keys.length} CRM import files (${failed.slice(0, 3).join("; ")}).`);
    }
    ctx.logger?.info(`Deleted ${keys.length} CRM import files.`);
}
