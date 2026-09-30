///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BackgroundService, NotificationUtils, ObjectFactory, RepoUtils } from "@rapidrest/service-core";
import { CrmModelClasses, CrmModelName, CrmRepos } from "../models/CrmModelClasses.js";
import type { CrmSetting } from "../models/types.js";
import { readOrCreateTokenSecret } from "../util/Secrets.js";
const { Config, Inject, Logger } = ObjectDecorators;

/**
 * What the CRM's background jobs share: the backend's model classes and repositories, the key links are signed with, the public site,
 * and pushing changes to a workspace's open pages. A subclass supplies `schedule` (from its own setting) and `run()`.
 */
export abstract class CrmJobBase extends BackgroundService {
    protected abstract classes: CrmModelClasses;

    // Automatically injected by ObjectFactory on instantiation
    protected _objectFactory?: ObjectFactory;

    @Inject(NotificationUtils)
    protected notificationUtils?: NotificationUtils;

    @Config("mail:crm:public_url", "")
    protected publicUrl: string = "";

    @Config("mail:crm:token_secret", "")
    protected configuredTokenSecret: string = "";

    @Logger
    protected logger?: any;

    private crmRepos?: CrmRepos;
    private cachedTokenSecret?: string;

    public start(): void {
        // Nothing to prepare: repositories are created on first use.
    }

    public stop(): void {
        // Nothing to release.
    }

    protected repos(): CrmRepos {
        this.crmRepos ??= new CrmRepos(this._objectFactory!, this.classes);
        return this.crmRepos;
    }

    protected async repo<T = any>(name: CrmModelName): Promise<RepoUtils<T & any>> {
        return await this.repos().get<T>(name);
    }

    /** The key tokens and tracking links are signed with - the same the routes use. */
    protected async tokenSecret(): Promise<string> {
        if (this.configuredTokenSecret) {
            return this.configuredTokenSecret;
        }
        this.cachedTokenSecret ??= await readOrCreateTokenSecret(await this.repo<CrmSetting>("setting"), this.classes.setting);
        return this.cachedTokenSecret;
    }

    /** An absolute link under `mail:crm:public_url`. */
    protected publicLink(path: string): string {
        return `${this.publicUrl.replace(/\/+$/, "")}${path}`;
    }

    /** Tells the workspace's open pages that a record changed. */
    protected notify(workspaceUid: string, type: string, data: unknown): void {
        this.notificationUtils?.sendMessage(workspaceUid, type, "update", JSON.parse(JSON.stringify(data)));
    }
}
