///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ModelUtils, RepoUtils } from "@rapidrest/service-core";
import { FilterField, FilterNode, compileFilter, filterFields, validateFilter } from "../filters/Filter.js";
import { CONTACT_FIELDS } from "../filters/fields.js";
import type { CrmModelClasses, CrmRepos } from "../models/CrmModelClasses.js";
import { CrmContact, CrmObjectType, PropertyDefinition, PropertyValue, Segment } from "../models/types.js";
import { CrmEventType, recordCrmEvent } from "../automation/Events.js";

/** The `PropertyValue` key of segment membership: one row per member, `stringValue` = the segment's uid. */
export const SEGMENTS_KEY = "segments";

/** The most contacts one segment holds; a filter matching more keeps the first (by uid) and is marked `capped`. */
export const MAX_SEGMENT_SIZE = 100_000;

/** How many rows one query of segments and scoring reads or changes (a setting only tests change). */
export const PAGING: { size: number } = { size: 1000 };

/** The fields a contact filter may name in `workspaceUid`: with `segments`, unless the filter defines a segment. */
export async function contactFilterFields(repos: CrmRepos, workspaceUid: string, withSegments: boolean): Promise<Record<string, FilterField>> {
    const definitions: PropertyDefinition[] = await (await repos.get<PropertyDefinition>("propertyDefinition")).find(
        { workspaceUid: ModelUtils.literal(workspaceUid), objectType: ModelUtils.literal(CrmObjectType.CONTACT) },
        { ignoreACL: true, limit: 1000, skipCache: true },
    );
    const fields: Record<string, FilterField> = filterFields(CONTACT_FIELDS, definitions, CrmObjectType.CONTACT);
    if (!withSegments) {
        delete fields.segments;
    }
    return fields;
}

/** `raw` as a segment's filter: a valid contact filter that doesn't name segments (a segment made of segments could loop). */
export async function readSegmentFilter(repos: CrmRepos, workspaceUid: string, raw: unknown): Promise<FilterNode> {
    return validateFilter(raw, await contactFilterFields(repos, workspaceUid, false));
}

/**
 * The uids of the contacts of `workspaceUid` that `filter` (already validated) matches, in uid order - at most `cap`; `capped` when
 * there were more.
 */
export async function matchingContacts(
    repos: CrmRepos,
    workspaceUid: string,
    filter: FilterNode,
    cap: number = MAX_SEGMENT_SIZE,
): Promise<{ uids: string[]; capped: boolean }> {
    const contacts: RepoUtils<CrmContact> = await repos.get<CrmContact>("contact");
    const condition: Record<string, unknown> = await compileFilter(filter, await contactFilterFields(repos, workspaceUid, true), {
        workspaceUid,
        objectType: CrmObjectType.CONTACT,
        valueRepo: await repos.get("propertyValue"),
        recordRepo: contacts,
    });
    const uids: string[] = [];
    let after: string | undefined;
    while (uids.length <= cap) {
        const page: CrmContact[] = await contacts.find(
            {
                workspaceUid: ModelUtils.literal(workspaceUid),
                ...(after ? { uid: ModelUtils.literal(after, "gt") } : {}),
                $and: [condition],
                sort: { uid: "ASC" },
            },
            { ignoreACL: true, limit: PAGING.size, skipCache: true },
        );
        uids.push(...page.map((contact) => contact.uid));
        if (page.length < PAGING.size) {
            break;
        }
        after = page[page.length - 1].uid;
    }
    return uids.length > cap ? { uids: uids.slice(0, cap), capped: true } : { uids, capped: false };
}

/** The uids of the current members of `segmentUid`. */
export async function segmentMembers(repos: CrmRepos, segmentUid: string): Promise<Set<string>> {
    const values: RepoUtils<PropertyValue> = await repos.get<PropertyValue>("propertyValue");
    const members: Set<string> = new Set();
    let after: string | undefined;
    for (;;) {
        const page: PropertyValue[] = await values.find(
            {
                key: ModelUtils.literal(SEGMENTS_KEY),
                stringValue: ModelUtils.literal(segmentUid),
                ...(after ? { uid: ModelUtils.literal(after, "gt") } : {}),
                sort: { uid: "ASC" },
            },
            { ignoreACL: true, limit: PAGING.size, skipCache: true },
        );
        page.forEach((row) => members.add(row.objectUid));
        if (page.length < PAGING.size) {
            return members;
        }
        after = page[page.length - 1].uid;
    }
}

/** Makes `uids` the members of `segment`: adds the new ones, removes the rest. Returns who entered and who left. */
export async function syncMembers(repos: CrmRepos, classes: CrmModelClasses, segment: Segment, uids: string[]): Promise<{ entered: string[]; left: string[] }> {
    const values: RepoUtils<PropertyValue> = await repos.get<PropertyValue>("propertyValue");
    const current: Set<string> = await segmentMembers(repos, segment.uid);
    const wanted: Set<string> = new Set(uids);
    const entered: string[] = uids.filter((uid) => !current.has(uid));
    const left: string[] = [...current].filter((uid) => !wanted.has(uid));
    for (let start = 0; start < left.length; start += PAGING.size) {
        await values.truncate(
            {
                key: ModelUtils.literal(SEGMENTS_KEY),
                stringValue: ModelUtils.literal(segment.uid),
                objectUid: ModelUtils.literal(left.slice(start, start + PAGING.size), "in"),
            },
            { ignoreACL: true },
        );
    }
    for (const contactUid of entered) {
        await values.create(
            new classes.propertyValue({ workspaceUid: segment.workspaceUid, objectType: CrmObjectType.CONTACT, objectUid: contactUid, key: SEGMENTS_KEY, stringValue: segment.uid }),
            { ignoreACL: true, skipPush: true },
        );
    }
    return { entered, left };
}

/** A segment's refresh: the counts to store on it, and who entered and left. */
export interface SegmentRefresh {
    counts: { memberCount: number; capped: boolean; refreshedAt: Date };
    entered: string[];
    left: string[];
}

/** Works a segment's members out from its filter and saves them. */
export async function refreshSegment(repos: CrmRepos, classes: CrmModelClasses, segment: Segment): Promise<SegmentRefresh> {
    const { uids, capped } = await matchingContacts(repos, segment.workspaceUid, segment.filter as FilterNode);
    const { entered, left } = await syncMembers(repos, classes, segment, uids);
    return { counts: { memberCount: uids.length, capped, refreshedAt: new Date() }, entered, left };
}

/** Records `segment.entered` and `segment.left` events for who entered and left `segment`. */
export async function recordSegmentEvents(repos: CrmRepos, classes: CrmModelClasses, segment: Segment, entered: string[], left: string[], logger?: any): Promise<void> {
    for (const [type, contactUids] of [
        [CrmEventType.SEGMENT_ENTERED, entered],
        [CrmEventType.SEGMENT_LEFT, left],
    ] as const) {
        for (const contactUid of contactUids) {
            await recordCrmEvent(repos, classes, { workspaceUid: segment.workspaceUid, type, contactUid, data: { segmentUid: segment.uid } }, logger);
        }
    }
}

/** Which of `contactUids` are in at least one of `segmentUids`. */
export async function inSegments(repos: CrmRepos, segmentUids: string[], contactUids: string[]): Promise<Set<string>> {
    if (segmentUids.length === 0 || contactUids.length === 0) {
        return new Set();
    }
    const rows: PropertyValue[] = await (await repos.get<PropertyValue>("propertyValue")).find(
        {
            key: ModelUtils.literal(SEGMENTS_KEY),
            stringValue: ModelUtils.literal(segmentUids, "in"),
            objectUid: ModelUtils.literal(contactUids, "in"),
        },
        { ignoreACL: true, limit: segmentUids.length * contactUids.length, skipCache: true },
    );
    return new Set(rows.map((row) => row.objectUid));
}
