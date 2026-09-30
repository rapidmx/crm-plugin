///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { CrmModelClasses, CrmRepos } from "../models/CrmModelClasses.js";

/** The events automations can start from or wait for. */
export enum CrmEventType {
    CONTACT_CREATED = "contact.created",
    CONTACT_UPDATED = "contact.updated",
    LIST_SUBSCRIBED = "list.subscribed",
    LIST_UNSUBSCRIBED = "list.unsubscribed",
    FORM_SUBMITTED = "form.submitted",
    SEGMENT_ENTERED = "segment.entered",
    SEGMENT_LEFT = "segment.left",
    EMAIL_SENT = "email.sent",
    EMAIL_OPENED = "email.opened",
    EMAIL_CLICKED = "email.clicked",
    EMAIL_REPLIED = "email.replied",
    EMAIL_BOUNCED = "email.bounced",
    EMAIL_UNSUBSCRIBED = "email.unsubscribed",
    DEAL_CREATED = "deal.created",
    DEAL_STAGE_CHANGED = "deal.stage_changed",
    DEAL_WON = "deal.won",
    DEAL_LOST = "deal.lost",
    /** A member put the contact in (`POST /automations/:ws/:uid/enroll`, or another automation's `enroll` step). */
    MANUAL = "manual",
}

/** One event, before it's stored. */
export interface CrmEventInput {
    workspaceUid: string;
    type: CrmEventType;
    contactUid: string;
    /** What the triggers and waits match on: `listUid`, `formUid`, `segmentUid`, `sendUid`, `sourceUid`, `fields`... */
    data?: Record<string, unknown>;
}

/**
 * Records that something happened to a contact, for automations (`AutomationTriggerJob`). Never throws: an event that can't be
 * recorded is logged, and whatever caused it still happens.
 */
export async function recordCrmEvent(repos: CrmRepos, classes: CrmModelClasses, event: CrmEventInput, logger?: any): Promise<void> {
    try {
        await (await repos.get("crmEvent")).create(new classes.crmEvent({ ...event, data: event.data ?? {}, occurredAt: new Date() }), {
            ignoreACL: true,
            skipPush: true,
        });
    } catch (err: any) {
        logger?.warn(`Could not record a ${event.type} event: ${err?.message ?? err}`);
    }
}
