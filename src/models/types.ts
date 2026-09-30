///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////

/** What every stored CRM record carries (set by the datastore). */
export interface CrmEntity {
    uid: string;
    dateCreated: Date;
    dateModified: Date;
    version: number;
}

/**
 * What a workspace member may do. Each role includes everything the ones below it may:
 * - `viewer`: read everything in the workspace.
 * - `editor`: also create, change and delete contacts, companies, notes, tasks and imports.
 * - `admin`: also change the workspace's settings, members, senders and custom properties.
 * - `owner`: also delete the workspace and make other members owners. A workspace always keeps at least one.
 */
export enum WorkspaceRole {
    OWNER = "owner",
    ADMIN = "admin",
    EDITOR = "editor",
    VIEWER = "viewer",
}

/** The ACL actions a workspace role grants on the workspace's own `AccessControlList` (see `util/WorkspaceAccess.ts`). */
export enum WorkspaceAction {
    READ = "READ",
    WRITE = "WRITE",
    MANAGE = "MANAGE",
}

/**
 * A shared CRM space: its own contacts, companies, custom properties, notes, tasks and (in later phases) lists, campaigns,
 * automations and pipelines. Who may use it is its members (`WorkspaceMember`), each granted their role's actions on the
 * workspace's own `AccessControlList`, whose uid is the workspace's uid. Nothing in a workspace belongs to a mailbox, except its
 * senders.
 */
export interface Workspace extends CrmEntity {
    name: string;
    description?: string;
    /** The IANA time zone dates are shown and scheduled in. */
    timezone: string;
    /** The postal address marketing mail must carry (CAN-SPAM), shown in the footer of every campaign. */
    postalAddress?: string;
    website?: string;
    /** The user who created it. */
    createdByUserUid: string;
}

/** A user's membership of a workspace. Unique per workspace and user. */
export interface WorkspaceMember extends CrmEntity {
    workspaceUid: string;
    /** The member's user uid (lowercase). */
    userUid: string;
    role: WorkspaceRole;
    /** The address the member was added by, or of a mailbox they own - for showing who they are. */
    address?: string;
    displayName?: string;
    addedByUserUid?: string;
}

/**
 * An address the workspace sends mail as, and the mailbox replies to it land in. Adding one requires send access to the mailbox, and
 * the mailbox becomes a connected mailbox: the CRM watches its mail for replies and bounces. Mailbox-scoped: erasing the mailbox
 * removes it.
 */
export interface WorkspaceSender extends CrmEntity {
    workspaceUid: string;
    mailboxUid: string;
    /** The `From` address - the mailbox's primary address or one of its aliases. */
    fromAddress: string;
    fromName: string;
    replyToAddress?: string;
    createdByUserUid: string;
}

/** The kinds of record custom properties, notes, tasks and timeline entries can belong to. */
export enum CrmObjectType {
    CONTACT = "contact",
    COMPANY = "company",
    DEAL = "deal",
}

/** Where a contact is in the customer journey. */
export enum LifecycleStage {
    SUBSCRIBER = "subscriber",
    LEAD = "lead",
    MARKETING_QUALIFIED = "marketing_qualified",
    SALES_QUALIFIED = "sales_qualified",
    OPPORTUNITY = "opportunity",
    CUSTOMER = "customer",
    EVANGELIST = "evangelist",
    OTHER = "other",
}

/** Whether marketing mail may be sent to a contact at all, across every list. */
export enum EmailStatus {
    ACTIVE = "active",
    UNSUBSCRIBED = "unsubscribed",
    BOUNCED = "bounced",
    COMPLAINED = "complained",
}

/** A person the workspace tracks. Unique per workspace by email address. */
export interface CrmContact extends CrmEntity {
    workspaceUid: string;
    /** Lowercase. */
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    jobTitle?: string;
    companyUid?: string;
    /** The member responsible for the contact. */
    ownerUserUid?: string;
    lifecycleStage: LifecycleStage;
    /** A free-form sales status, such as `new`, `attempted` or `connected`. */
    leadStatus?: string;
    /** The lead score (Phase 5 scoring rules). */
    score: number;
    /** Lowercase labels. Mirrored into `PropertyValue` rows (key `tags`) so filters can match them on SQL too. */
    tags: string[];
    /** Where the contact came from: `manual`, `import`, `form`, `api`, ... */
    source?: string;
    emailStatus: EmailStatus;
    /** When the contact last opened, clicked or replied to mail from the workspace. */
    lastEngagedAt?: Date;
}

/** An organization the workspace tracks. */
export interface CrmCompany extends CrmEntity {
    workspaceUid: string;
    name: string;
    /** The company's web domain, lowercase, without `www.` - how contacts are matched to it. */
    domain?: string;
    industry?: string;
    employeeCount?: number;
    phone?: string;
    website?: string;
    city?: string;
    country?: string;
    ownerUserUid?: string;
    /** Lowercase labels, mirrored into `PropertyValue` rows like a contact's. */
    tags: string[];
}

/** The value types a custom property can hold. */
export enum PropertyType {
    TEXT = "text",
    NUMBER = "number",
    DATE = "date",
    BOOLEAN = "boolean",
    SELECT = "select",
    MULTI_SELECT = "multi_select",
}

/** One option of a `select`/`multi_select` property. */
export interface PropertyOption {
    value: string;
    label: string;
}

/** A custom property the workspace defines for contacts, companies or deals. Unique per workspace, object type and key. */
export interface PropertyDefinition extends CrmEntity {
    workspaceUid: string;
    objectType: CrmObjectType;
    /** Lowercase letters, digits and underscores, starting with a letter. Never one of the object's own field names. */
    key: string;
    label: string;
    type: PropertyType;
    options: PropertyOption[];
    group?: string;
    description?: string;
}

/**
 * One value of a custom property (or one tag) of one record, stored as its own row so filters can compare it on both Mongo and SQL
 * with an index, rather than by searching a JSON column. A `multi_select` value, like a tag, is one row per selected option.
 */
export interface PropertyValue extends CrmEntity {
    workspaceUid: string;
    objectType: CrmObjectType;
    objectUid: string;
    key: string;
    /** Set for `text`, `select` and `multi_select` values and tags (lowercased for tags). */
    stringValue?: string;
    /** Set for `number` values, and `boolean` ones as `1`/`0`. */
    numberValue?: number;
    /** Set for `date` values. */
    dateValue?: Date;
}

/** A note written on a contact, company or deal. */
export interface CrmNote extends CrmEntity {
    workspaceUid: string;
    subjectType: CrmObjectType;
    subjectUid: string;
    /** Plain text. */
    body: string;
    authorUserUid: string;
    pinned: boolean;
}

export enum TaskStatus {
    OPEN = "open",
    DONE = "done",
}

export enum TaskPriority {
    LOW = "low",
    NORMAL = "normal",
    HIGH = "high",
}

/** A to-do for a member, optionally about a contact, company or deal. */
export interface CrmTask extends CrmEntity {
    workspaceUid: string;
    title: string;
    notes?: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueAt?: Date;
    assigneeUserUid?: string;
    subjectType?: CrmObjectType;
    subjectUid?: string;
    completedAt?: Date;
    createdByUserUid: string;
}

/** What a timeline entry records. Later phases add email and deal kinds. */
export enum TimelineKind {
    CREATED = "created",
    UPDATED = "updated",
    NOTE = "note",
    TASK_CREATED = "task_created",
    TASK_COMPLETED = "task_completed",
    IMPORTED = "imported",
    EMAIL_SENT = "email_sent",
    EMAIL_RECEIVED = "email_received",
}

/** One entry of a contact's, company's or deal's activity timeline. Append-only. */
export interface TimelineEvent extends CrmEntity {
    workspaceUid: string;
    subjectType: CrmObjectType;
    subjectUid: string;
    kind: TimelineKind | string;
    occurredAt: Date;
    actorUserUid?: string;
    /** A short sentence for the timeline. */
    summary: string;
    /** Kind-specific details, e.g. the fields an update changed. */
    data: Record<string, unknown>;
    /** The record the entry is about, when it is another one (the note, the task, the message). */
    refUid?: string;
}

export enum ImportStatus {
    /** Uploaded; waiting for its column mapping. */
    UPLOADED = "uploaded",
    /** Mapped; waiting for `CrmImportJob`. */
    QUEUED = "queued",
    RUNNING = "running",
    DONE = "done",
    FAILED = "failed",
}

/** Where one CSV column goes: a contact or company field, a custom property (`properties.<key>`), `tags`, or nowhere. */
export interface ImportColumnMapping {
    column: string;
    /** `undefined` skips the column. */
    target?: string;
}

/** One row an import could not take. */
export interface ImportRowError {
    /** 1-based, counting the header as row 1. */
    row: number;
    message: string;
}

/** A CSV import of contacts or companies, processed in the background by `CrmImportJob`. */
export interface CrmImport extends CrmEntity {
    workspaceUid: string;
    objectType: CrmObjectType;
    fileName: string;
    /** The uploaded CSV in the `BlobStore`. */
    blobKey: string;
    /** The CSV's header row, as read at upload. */
    columns: string[];
    mapping: ImportColumnMapping[];
    /** Whether a row whose email (contacts) or domain (companies) is already there updates that record; otherwise it is skipped. */
    updateExisting: boolean;
    /** Tags added to every imported record. */
    tags: string[];
    status: ImportStatus;
    totalRows: number;
    processedRows: number;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    /** At most `MAX_IMPORT_ERRORS` of them. */
    errors: ImportRowError[];
    createdByUserUid: string;
    /** While `RUNNING`: until when the replica working on it owns it. */
    leaseExpiresAt?: Date;
    attempts: number;
    finishedAt?: Date;
}

/** How many row errors an import keeps. */
export const MAX_IMPORT_ERRORS = 100;
