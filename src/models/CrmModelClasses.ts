///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { BaseEntity, ObjectFactory, type RepoFindOptions, RepoUtils, SimpleEntity } from "@rapidrest/service-core";

/**
 * The concrete (Mongo or SQL) class of every model the CRM routes and jobs read and write - `MONGO_MODELS` or `SQL_MODELS`. A route or
 * job is backend-agnostic code plus one of these, so its concrete subclasses are one line each.
 */
export interface CrmModelClasses {
    workspace: any;
    workspaceMember: any;
    workspaceSender: any;
    contact: any;
    company: any;
    propertyDefinition: any;
    propertyValue: any;
    note: any;
    task: any;
    timelineEvent: any;
    import: any;
    mailingList: any;
    subscription: any;
    suppression: any;
    form: any;
    setting: any;
    /** `@rapidmx/restapi`'s `Mailbox`. */
    mailbox: any;
}

/** The name of one of `CrmModelClasses`. */
export type CrmModelName = keyof CrmModelClasses;

/**
 * `RepoUtils` whose `find()` pages the same way on both backends. On MongoDB `RepoUtils.find()` takes the page size from its options'
 * `limit`, but on SQL from the *query's* `limit` (falling back to 100) - so a caller paging by the options alone silently got 100 rows
 * a page on SQL. This copies the options' `limit` into the query when the query has none.
 *
 * It also makes every sorted query's order total by adding `uid` as a last sort key, so records with equal sort values (created in the
 * same millisecond, the same score) come back in the same order on every page instead of repeating or going missing between pages.
 */
export class CrmRepoUtils<T extends BaseEntity | SimpleEntity> extends RepoUtils<T> {
    public override async find(query: any, options?: RepoFindOptions): Promise<T[]> {
        let paged: any = query;
        if (options?.limit !== undefined && (query === undefined || query === null || query.limit === undefined)) {
            paged = { ...query, limit: options.limit };
        }
        if (paged?.sort && typeof paged.sort === "object" && !("uid" in paged.sort)) {
            paged = { ...paged, sort: { ...paged.sort, uid: "ASC" } };
        }
        return await super.find(paged, options);
    }
}

/** Creates (once each, on first use) the `RepoUtils` (`CrmRepoUtils`) of every model in a `CrmModelClasses`. */
export class CrmRepos {
    private readonly repos: Map<CrmModelName, RepoUtils<any>> = new Map();

    public constructor(
        private readonly objectFactory: ObjectFactory,
        public readonly classes: CrmModelClasses,
    ) {}

    /** The `RepoUtils` of `name`'s model. */
    public async get<T = any>(name: CrmModelName): Promise<RepoUtils<T & any>> {
        let repo: RepoUtils<any> | undefined = this.repos.get(name);
        if (!repo) {
            const modelClass: any = this.classes[name];
            repo = await this.objectFactory.newInstance(CrmRepoUtils, { name: modelClass.name, args: [modelClass] });
            this.repos.set(name, repo!);
        }
        return repo!;
    }
}
