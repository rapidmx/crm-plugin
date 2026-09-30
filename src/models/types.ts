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
    /** How many lead scoring rules the workspace has (`BaseScoringRuleRoute` keeps it), so the scoring job only visits workspaces with some. */
    scoringRules: number;
    /** The rules changed since contacts were last scored. */
    scoringDirty: boolean;
    /** When contacts were last scored. */
    scoredAt?: Date;
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
    SUBSCRIBED = "subscribed",
    UNSUBSCRIBED = "unsubscribed",
    FORM_SUBMITTED = "form_submitted",
    EMAIL_OPENED = "email_opened",
    EMAIL_CLICKED = "email_clicked",
    EMAIL_REPLIED = "email_replied",
    EMAIL_BOUNCED = "email_bounced",
    EMAIL_COMPLAINED = "email_complained",
    AUTOMATION_ENTERED = "automation_entered",
    AUTOMATION_FINISHED = "automation_finished",
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
    /** A mailing list every imported contact is subscribed to (source `import`), if the importer chose one. */
    listUid?: string;
}

/** How many row errors an import keeps. */
export const MAX_IMPORT_ERRORS = 100;

/**
 * A mailing list of a workspace: the contacts subscribed to it get the campaigns sent to it. A list shown in the preference center
 * (`visible`) is one a subscriber can join or leave there by themselves; with `doubleOptIn`, a subscription made by a form stays
 * pending until the subscriber confirms it by email, sent from `senderUid`.
 */
export interface MailingList extends CrmEntity {
    workspaceUid: string;
    name: string;
    description?: string;
    /** The name subscribers see (in the preference center and confirmation emails). */
    publicName: string;
    publicDescription?: string;
    doubleOptIn: boolean;
    /** Shown in the preference center even to contacts not subscribed to it. */
    visible: boolean;
    /** The `WorkspaceSender` confirmation emails are sent from. Required with `doubleOptIn`. */
    senderUid?: string;
}

export enum SubscriptionStatus {
    /** Waiting for the subscriber to confirm by email (double opt-in). */
    PENDING = "pending",
    SUBSCRIBED = "subscribed",
    UNSUBSCRIBED = "unsubscribed",
}

/**
 * A contact's subscription to a list, with the consent behind it. Unique per list and contact. An unsubscribed one is kept (not
 * deleted) as the record that the contact opted out.
 */
export interface Subscription extends CrmEntity {
    workspaceUid: string;
    listUid: string;
    contactUid: string;
    status: SubscriptionStatus;
    /** How it was made: `form`, `import`, `manual`, `preferences`, `api`. */
    source: string;
    /** When the contact gave (or confirmed) consent. */
    consentAt?: Date;
    /** The address consent was given from, for a form or preference center subscription. */
    consentIp?: string;
    unsubscribedAt?: Date;
    /** When the last confirmation email was sent, while pending. */
    confirmSentAt?: Date;
}

export enum SuppressionReason {
    HARD_BOUNCE = "hard_bounce",
    COMPLAINT = "complaint",
    MANUAL = "manual",
}

/**
 * An address the workspace must never send marketing mail to, whatever list it is on and even after its contact is deleted and made
 * again. Unique per workspace and address.
 */
export interface Suppression extends CrmEntity {
    workspaceUid: string;
    /** Lowercase. */
    email: string;
    reason: SuppressionReason;
    note?: string;
}

/** One field of a signup form. */
export interface FormField {
    /** Where the value goes: `email`, `firstName`, `lastName`, `phone`, `jobTitle`, `company`, or `properties.<key>`. */
    target: string;
    label: string;
    required: boolean;
}

/** A public signup form: who fills it in becomes (or updates) a contact and is subscribed to its lists. */
export interface CrmForm extends CrmEntity {
    workspaceUid: string;
    name: string;
    /** The heading the form shows. */
    title: string;
    description?: string;
    fields: FormField[];
    listUids: string[];
    /** Subscriptions stay pending until confirmed by email. */
    doubleOptIn: boolean;
    /** The sender of the confirmation email. Required with `doubleOptIn`. */
    senderUid?: string;
    /** What the form says once submitted. */
    successMessage: string;
    /** Where the browser goes once submitted, instead of the message (https only). */
    redirectUrl?: string;
    /** Tags added to the contact. */
    tags: string[];
    enabled: boolean;
    submissionCount: number;
}

/** A deployment-wide value the plugin generates and keeps (the key tokens are signed with). Unique by `key`. */
export interface CrmSetting extends CrmEntity {
    key: string;
    value: string;
}

/** An email template: a design (sections of blocks, rendered with MJML) with a subject and preview line, both able to hold merge tags. */
export interface EmailTemplate extends CrmEntity {
    workspaceUid: string;
    name: string;
    /** A free-form grouping: `newsletter`, `welcome`, `transactional`... */
    category?: string;
    subject: string;
    /** The line inboxes show after the subject. */
    preheader?: string;
    /** The design - see `templates/Design.ts`'s `TemplateDesign`. */
    design: unknown;
}

/** A block (or several) saved to be reused in other templates. */
export interface SavedBlock extends CrmEntity {
    workspaceUid: string;
    name: string;
    /** The saved blocks - see `templates/Design.ts`'s `DesignBlock`. */
    blocks: unknown[];
}

/** Where a campaign is. */
export enum CampaignStatus {
    /** Being written; can be changed. */
    DRAFT = "draft",
    /** Waiting for `scheduledAt`. */
    SCHEDULED = "scheduled",
    /** Its recipients are being worked out (`CampaignJob`). */
    PREPARING = "preparing",
    /** Its messages are going out (`SendDispatchJob`). */
    SENDING = "sending",
    /** Stopped by a member; resuming carries on where it stopped. */
    PAUSED = "paused",
    /** Every message has been sent or given up on. */
    SENT = "sent",
    /** Stopped for good; unsent messages were dropped. */
    CANCELLED = "cancelled",
    /** Couldn't be sent at all (`error` says why). */
    FAILED = "failed",
}

/** What an A/B test's winner is picked by: the share of its recipients who opened, clicked or replied. */
export enum AbMetric {
    OPEN = "open",
    CLICK = "click",
    REPLY = "reply",
}

/** One version of a campaign in an A/B test: its own subject line, template, or both. */
export interface CampaignVariant {
    /** `A`, `B`, `C` or `D`. */
    id: string;
    /** The subject line, replacing the template's. */
    subject?: string;
    /** The template, replacing the campaign's. */
    templateUid?: string;
}

/**
 * An A/B test: `testPercent` of the audience is split evenly between the variants; after `testHours` the variant with the best
 * `metric` is sent to everyone else.
 */
export interface AbTest {
    variants: CampaignVariant[];
    testPercent: number;
    metric: AbMetric;
    testHours: number;
    /** The winning variant, once picked. */
    winnerId?: string;
    decidedAt?: Date;
}

/** A campaign's (or one variant's) numbers: recipients, and how many of them each thing happened to at least once. */
export interface CampaignCounts {
    recipients: number;
    sent: number;
    failed: number;
    suppressed: number;
    bounced: number;
    opened: number;
    clicked: number;
    replied: number;
    unsubscribed: number;
    complained: number;
}

/** A campaign's numbers, overall and per A/B variant. */
export interface CampaignStats extends CampaignCounts {
    variants?: Record<string, CampaignCounts>;
}

/** A one-off email to the subscribers of some lists. */
export interface Campaign extends CrmEntity {
    workspaceUid: string;
    name: string;
    status: CampaignStatus;
    templateUid?: string;
    senderUid?: string;
    /** The lists whose subscribers get it. */
    listUids: string[];
    /** Lists whose subscribers don't, even when on one of `listUids`. */
    excludeListUids: string[];
    /** When not empty, only subscribers in one of these segments get it. */
    segmentUids: string[];
    /** Subscribers in these segments don't get it. */
    excludeSegmentUids: string[];
    /** Adds an invisible image that reports opens. */
    trackOpens: boolean;
    /** Sends links through a redirect that reports clicks. */
    trackClicks: boolean;
    abTest?: AbTest;
    /** When it goes out (on `schedule`: now, if not given). */
    scheduledAt?: Date;
    startedAt?: Date;
    finishedAt?: Date;
    /** How far the audience has been worked out: the uid of the last subscription read. */
    audienceCursor?: string;
    audienceDone: boolean;
    /** While `CampaignJob` prepares it on one replica. */
    leaseExpiresAt?: Date;
    recipientCount: number;
    stats: CampaignStats;
    statsAt?: Date;
    error?: string;
    createdByUserUid: string;
}

/** Where one outbound message is. */
export enum SendStatus {
    /** Waiting to go out. */
    QUEUED = "queued",
    /** Held back for an A/B test's winner. */
    HELD = "held",
    SENT = "sent",
    /** The mail transport refused it for good, or retries ran out. */
    FAILED = "failed",
    /** Not sent: the address is suppressed, unsubscribed or bounced by the time its turn came. */
    SUPPRESSED = "suppressed",
    /** Not sent: its campaign was cancelled. */
    CANCELLED = "cancelled",
}

/** What one outbound message was sent for. */
export enum SendSource {
    CAMPAIGN = "campaign",
    AUTOMATION = "automation",
}

/**
 * One marketing message to one contact, and what came of it. Its `token` names it in tracking links, in its `Message-ID` and in
 * its bounce address. Unique by `dedupeKey`, so a campaign (or an automation step) never mails a contact twice.
 */
export interface OutboundSend extends CrmEntity {
    workspaceUid: string;
    sourceType: SendSource;
    /** The campaign (or automation) it was sent for. */
    sourceUid: string;
    /** `campaign:<campaignUid>:<contactUid>`, `automation:<enrollmentUid>:<nodeId>`... */
    dedupeKey: string;
    contactUid: string;
    /** The address, as it was when the message was queued. */
    email: string;
    /** The A/B variant (`A` without a test; empty while held for a winner). */
    variantId: string;
    status: SendStatus;
    /** Random and unguessable. */
    token: string;
    /** The `Message-ID` header (without angle brackets), once sent. */
    messageId?: string;
    attempts: number;
    /** When it may be tried next. */
    nextAttemptAt: Date;
    /** While one replica is sending it. */
    leaseExpiresAt?: Date;
    sentAt?: Date;
    error?: string;
    firstOpenedAt?: Date;
    lastOpenedAt?: Date;
    openCount: number;
    /** Every open so far looked automatic (a mail server or privacy proxy fetching images). */
    machineOpen: boolean;
    firstClickedAt?: Date;
    clickCount: number;
    repliedAt?: Date;
    bouncedAt?: Date;
    /** `hard` or `soft`. */
    bounceType?: string;
    complainedAt?: Date;
    unsubscribedAt?: Date;
    /** An automation message's step (its `send_email` node). */
    nodeId?: string;
    /** An automation message's template (a campaign's comes from the campaign). */
    templateUid?: string;
    /** An automation message's sender. */
    senderUid?: string;
    /** An automation message's subject line, replacing the template's. */
    subject?: string;
}

/** What an engagement event records. */
export enum EngagementType {
    SENT = "sent",
    FAILED = "failed",
    OPENED = "opened",
    CLICKED = "clicked",
    REPLIED = "replied",
    BOUNCED = "bounced",
    COMPLAINED = "complained",
    UNSUBSCRIBED = "unsubscribed",
}

/** One thing that happened to an outbound message. Append-only. */
export interface EngagementEvent extends CrmEntity {
    workspaceUid: string;
    sendUid: string;
    sourceType: SendSource;
    sourceUid: string;
    contactUid: string;
    variantId: string;
    type: EngagementType;
    occurredAt: Date;
    /** Type-specific details: a click's `url` and `index`, an open's `machine`, a bounce's `status` and `bounceType`. */
    data: Record<string, unknown>;
}

/** How a segment's members are kept. */
export enum SegmentKind {
    /** Recomputed from its filter as contacts change (`SegmentRefreshJob`). */
    DYNAMIC = "dynamic",
    /** The contacts that matched when it was made (or last refreshed by hand). */
    STATIC = "static",
}

/**
 * A named group of contacts, defined by a filter. Its members are `PropertyValue` rows (key `segments`, the segment's uid), so any
 * contact filter can name segments - `{ field: "segments", op: "eq", value: segmentUid }` - and campaigns can aim at them.
 */
export interface Segment extends CrmEntity {
    workspaceUid: string;
    name: string;
    description?: string;
    kind: SegmentKind;
    /** A contact filter (`filters/Filter.ts`), which may not itself name segments. */
    filter: unknown;
    memberCount: number;
    /** The filter matched more contacts than a segment may hold; only the first were kept. */
    capped: boolean;
    refreshedAt?: Date;
    createdByUserUid: string;
}

/** What a scoring rule scores. */
export enum ScoringKind {
    /** Contacts matching a filter get the points once. */
    PROPERTY = "property",
    /** Contacts get the points for each time they did something (within `withinDays`), up to `maxPoints`. */
    ACTIVITY = "activity",
}

/** What an activity scoring rule counts. */
export enum ScoringActivity {
    OPENED = "opened",
    CLICKED = "clicked",
    REPLIED = "replied",
    FORM_SUBMITTED = "form_submitted",
    SUBSCRIBED = "subscribed",
    UNSUBSCRIBED = "unsubscribed",
    BOUNCED = "bounced",
}

/** One rule of a workspace's lead scoring; a contact's `score` is the sum of every enabled rule's points for them. */
export interface ScoringRule extends CrmEntity {
    workspaceUid: string;
    name: string;
    enabled: boolean;
    kind: ScoringKind;
    /** A contact filter, for a property rule. */
    filter?: unknown;
    /** What an activity rule counts. */
    activity?: ScoringActivity;
    /** Points per match (property) or per time (activity); negative takes points away. */
    points: number;
    /** An activity rule's points count up to this (in absolute value). None: no limit. */
    maxPoints?: number;
    /** An activity rule counts only what happened in these last days. None: ever. */
    withinDays?: number;
}

/** Where an automation is. */
export enum AutomationStatus {
    /** Never published: contacts can't enter it. */
    DRAFT = "draft",
    /** Its published version enrolls contacts and moves them along. */
    ACTIVE = "active",
    /** Nobody enters it and nobody moves on until it is resumed. */
    PAUSED = "paused",
}

/** When a contact may enter an automation again. */
export enum AutomationReentry {
    /** Once, ever. */
    NEVER = "never",
    /** Again once their last run through it has finished. */
    AFTER_EXIT = "after_exit",
}

/**
 * A workflow contacts go through: a trigger, then steps - waits, conditions, emails and actions - joined by edges. `graph` is the
 * draft being edited; contacts go through the published version (`AutomationVersion`), which a new publish replaces for new
 * enrollments only.
 */
export interface Automation extends CrmEntity {
    workspaceUid: string;
    name: string;
    description?: string;
    status: AutomationStatus;
    /** The draft - see `automation/Graph.ts`. */
    graph: unknown;
    reentry: AutomationReentry;
    /** Contacts matching this contact filter leave the automation, their goal reached. */
    goalFilter?: unknown;
    publishedVersionUid?: string;
    publishedAt?: Date;
    createdByUserUid: string;
}

/** An automation's graph as published. Immutable: running enrollments keep going through the version they entered. */
export interface AutomationVersion extends CrmEntity {
    workspaceUid: string;
    automationUid: string;
    /** 1 for the first publish, and so on. */
    versionNumber: number;
    graph: unknown;
    publishedByUserUid: string;
}

/** Where a contact is in an automation. */
export enum EnrollmentState {
    /** Due to move on at `nextRunAt`. */
    ACTIVE = "active",
    /** Waiting for something to happen (`waitFor`), at most until `nextRunAt`. */
    WAITING = "waiting",
    /** Went through to the end, or reached the goal. */
    COMPLETED = "completed",
    /** Taken out: by a member, or because the contact or automation went away. */
    EXITED = "exited",
    /** Stopped by an error (`error`). */
    FAILED = "failed",
}

/** What a waiting enrollment waits for. */
export interface EnrollmentWait {
    /** The node the enrollment waits at. */
    nodeId: string;
    /** The event that ends the wait, for a wait node; none for a delay. */
    event?: string;
    /** The message the event must be about. */
    sendUid?: string;
}

/** One step an enrollment took. */
export interface EnrollmentStep {
    nodeId: string;
    at: Date;
    /** What happened: `next`, `yes`, `timeout`, `sent`... */
    outcome: string;
}

/** One contact's run through an automation. */
export interface Enrollment extends CrmEntity {
    workspaceUid: string;
    automationUid: string;
    versionUid: string;
    contactUid: string;
    state: EnrollmentState;
    currentNodeId: string;
    nextRunAt: Date;
    waitFor?: EnrollmentWait;
    leaseExpiresAt?: Date;
    /** How many steps it has taken, to stop a runaway loop. */
    steps: number;
    /** Its most recent steps. */
    history: EnrollmentStep[];
    enteredAt: Date;
    finishedAt?: Date;
    error?: string;
}

/**
 * Something that happened to a contact, for automations to react to: contact.created, contact.updated, list.subscribed,
 * list.unsubscribed, form.submitted, segment.entered, segment.left, email.sent, email.opened, email.clicked, email.replied,
 * email.bounced, email.unsubscribed. `AutomationTriggerJob` hands each to the workspace's automations once (`dispatchedAt`).
 */
export interface CrmEvent extends CrmEntity {
    workspaceUid: string;
    type: string;
    contactUid: string;
    occurredAt: Date;
    data: Record<string, unknown>;
    dispatchedAt?: Date;
}
