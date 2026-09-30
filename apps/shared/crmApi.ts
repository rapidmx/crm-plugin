///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over this plugin's API (`/api/mail/crm/...`). The shapes mirror the server's (`src/models/types.ts`), with dates as
 * ISO strings the way JSON carries them.
 */
import { ApiRequestError, apiFetch, apiUrl, withCsrfHeader } from "@rapidmx/web-client/lib/util/api.js";

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";
export type CrmObjectType = "contact" | "company";
/** What notes, tasks and timelines can be about. */
export type SubjectType = CrmObjectType | "deal";

interface Stored {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
}

export interface Workspace extends Stored {
    name: string;
    description?: string;
    timezone: string;
    postalAddress?: string;
    website?: string;
    createdByUserUid: string;
    /** The caller's own role. */
    role: WorkspaceRole;
}

export interface WorkspaceMember extends Stored {
    workspaceUid: string;
    userUid: string;
    role: WorkspaceRole;
    address?: string;
    displayName?: string;
}

export interface WorkspaceSender extends Stored {
    workspaceUid: string;
    mailboxUid: string;
    fromAddress: string;
    fromName: string;
    replyToAddress?: string;
    /** Mail its mailbox exchanges with contacts goes on their timelines. */
    logEmail?: boolean;
}

export type PropertyViewValue = string | number | boolean | string[];

export interface Contact extends Stored {
    workspaceUid: string;
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    jobTitle?: string;
    companyUid?: string;
    ownerUserUid?: string;
    lifecycleStage: string;
    leadStatus?: string;
    score: number;
    tags: string[];
    source?: string;
    emailStatus: string;
    lastEngagedAt?: string;
    properties: Record<string, PropertyViewValue>;
}

export interface Company extends Stored {
    workspaceUid: string;
    name: string;
    domain?: string;
    industry?: string;
    employeeCount?: number;
    phone?: string;
    website?: string;
    city?: string;
    country?: string;
    ownerUserUid?: string;
    tags: string[];
    properties: Record<string, PropertyViewValue>;
}

export type CrmRecord = Contact | Company;

export type PropertyType = "text" | "number" | "date" | "boolean" | "select" | "multi_select";

export interface PropertyDefinition extends Stored {
    workspaceUid: string;
    objectType: CrmObjectType;
    key: string;
    label: string;
    type: PropertyType;
    options: { value: string; label: string }[];
    group?: string;
    description?: string;
}

export interface Note extends Stored {
    subjectType: SubjectType;
    subjectUid: string;
    body: string;
    authorUserUid: string;
    pinned: boolean;
}

export type TaskStatus = "open" | "done";
export type TaskPriority = "low" | "normal" | "high";

export interface Task extends Stored {
    title: string;
    notes?: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueAt?: string;
    assigneeUserUid?: string;
    subjectType?: SubjectType;
    subjectUid?: string;
    completedAt?: string;
}

export interface TimelineEvent extends Stored {
    kind: string;
    occurredAt: string;
    actorUserUid?: string;
    summary: string;
    data: Record<string, unknown>;
}

export interface ImportColumnMapping {
    column: string;
    target?: string;
}

export interface CrmImport extends Stored {
    objectType: CrmObjectType;
    fileName: string;
    columns: string[];
    mapping: ImportColumnMapping[];
    updateExisting: boolean;
    tags: string[];
    status: "uploaded" | "queued" | "running" | "done" | "failed";
    totalRows: number;
    processedRows: number;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    errors: { row: number; message: string }[];
}

export interface ImportUpload {
    import: CrmImport;
    targets: string[];
    preview: string[][];
}

/** A filter condition or group, as `POST .../search` takes it. */
export interface FilterCondition {
    field: string;
    op: string;
    value?: unknown;
}
export interface FilterGroup {
    and?: FilterNode[];
    or?: FilterNode[];
}
export type FilterNode = FilterCondition | FilterGroup;

export interface SearchRequest {
    filter?: FilterNode;
    q?: string;
    sort?: { field: string; direction: "asc" | "desc" };
    limit?: number;
    page?: number;
}

export interface SearchResult<T> {
    items: T[];
    total: number;
}

const enc = encodeURIComponent;
const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/** The API path of one kind of record: `contacts` or `companies`. */
export function recordPath(objectType: CrmObjectType): string {
    return objectType === "contact" ? "contacts" : "companies";
}

// Workspaces

export const listWorkspaces = (): Promise<Workspace[]> => apiFetch("/mail/crm/workspaces");
export const getWorkspace = (uid: string): Promise<Workspace> => apiFetch(`/mail/crm/workspaces/${enc(uid)}`);
export const createWorkspace = (input: Partial<Workspace>): Promise<Workspace> => apiFetch("/mail/crm/workspaces", json("POST", input));
export const updateWorkspace = (uid: string, input: Partial<Workspace>): Promise<Workspace> => apiFetch(`/mail/crm/workspaces/${enc(uid)}`, json("PUT", input));
export const deleteWorkspace = (uid: string): Promise<void> => apiFetch(`/mail/crm/workspaces/${enc(uid)}`, json("DELETE"));
export const listMembers = (uid: string): Promise<WorkspaceMember[]> => apiFetch(`/mail/crm/workspaces/${enc(uid)}/members`);
export const addMember = (uid: string, input: { address?: string; userUid?: string; role: WorkspaceRole }): Promise<WorkspaceMember> =>
    apiFetch(`/mail/crm/workspaces/${enc(uid)}/members`, json("POST", input));
export const updateMember = (uid: string, userUid: string, role: WorkspaceRole): Promise<WorkspaceMember> =>
    apiFetch(`/mail/crm/workspaces/${enc(uid)}/members/${enc(userUid)}`, json("PUT", { role }));
export const removeMember = (uid: string, userUid: string): Promise<void> => apiFetch(`/mail/crm/workspaces/${enc(uid)}/members/${enc(userUid)}`, json("DELETE"));
export const listSenders = (uid: string): Promise<WorkspaceSender[]> => apiFetch(`/mail/crm/workspaces/${enc(uid)}/senders`);
export const updateSender = (uid: string, senderUid: string, input: { fromName?: string; replyToAddress?: string | null; logEmail?: boolean }): Promise<WorkspaceSender> =>
    apiFetch(`/mail/crm/workspaces/${enc(uid)}/senders/${enc(senderUid)}`, json("PUT", input));
export const addSender = (uid: string, input: { fromAddress: string; fromName?: string; replyToAddress?: string; logEmail?: boolean }): Promise<WorkspaceSender> =>
    apiFetch(`/mail/crm/workspaces/${enc(uid)}/senders`, json("POST", input));
export const removeSender = (uid: string, senderUid: string): Promise<void> => apiFetch(`/mail/crm/workspaces/${enc(uid)}/senders/${enc(senderUid)}`, json("DELETE"));

// Contacts and companies

export function searchRecords<T extends CrmRecord>(objectType: CrmObjectType, workspaceUid: string, request: SearchRequest): Promise<SearchResult<T>> {
    return apiFetch(`/mail/crm/${recordPath(objectType)}/${enc(workspaceUid)}/search`, json("POST", request));
}
export function getRecord<T extends CrmRecord>(objectType: CrmObjectType, workspaceUid: string, uid: string): Promise<T> {
    return apiFetch(`/mail/crm/${recordPath(objectType)}/${enc(workspaceUid)}/${enc(uid)}`);
}
export function createRecord<T extends CrmRecord>(objectType: CrmObjectType, workspaceUid: string, input: Record<string, unknown>): Promise<T> {
    return apiFetch(`/mail/crm/${recordPath(objectType)}/${enc(workspaceUid)}`, json("POST", input));
}
export function updateRecord<T extends CrmRecord>(objectType: CrmObjectType, workspaceUid: string, uid: string, input: Record<string, unknown>): Promise<T> {
    return apiFetch(`/mail/crm/${recordPath(objectType)}/${enc(workspaceUid)}/${enc(uid)}`, json("PUT", input));
}
export function deleteRecord(objectType: CrmObjectType, workspaceUid: string, uid: string): Promise<void> {
    return apiFetch(`/mail/crm/${recordPath(objectType)}/${enc(workspaceUid)}/${enc(uid)}`, json("DELETE"));
}
export function bulkRecords(
    objectType: CrmObjectType,
    workspaceUid: string,
    input: { uids: string[]; action: "delete" | "addTags" | "removeTags" | "setOwner"; tags?: string[]; ownerUserUid?: string | null },
): Promise<{ changed: number }> {
    return apiFetch(`/mail/crm/${recordPath(objectType)}/${enc(workspaceUid)}/bulk`, json("POST", input));
}

/** Downloads the records matching `request` as a CSV file. Browser only. */
export async function exportRecords(objectType: CrmObjectType, workspaceUid: string, request: SearchRequest): Promise<void> {
    const response: Response = await fetch(apiUrl(`/mail/crm/${recordPath(objectType)}/${enc(workspaceUid)}/export`), {
        method: "POST",
        credentials: "include",
        headers: withCsrfHeader({ "Content-Type": "application/json" }),
        body: JSON.stringify(request),
    });
    if (!response.ok) {
        throw await responseError(response);
    }
    const link: HTMLAnchorElement = document.createElement("a");
    link.href = URL.createObjectURL(await response.blob());
    link.download = `${recordPath(objectType)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

// Properties, notes, tasks, timeline

export const listProperties = (workspaceUid: string, objectType?: CrmObjectType): Promise<PropertyDefinition[]> =>
    apiFetch(`/mail/crm/properties/${enc(workspaceUid)}?limit=200${objectType ? `&objectType=${objectType}` : ""}`);
export const createProperty = (workspaceUid: string, input: Omit<Partial<PropertyDefinition>, "options"> & { options?: (string | { value: string; label?: string })[] }): Promise<PropertyDefinition> =>
    apiFetch(`/mail/crm/properties/${enc(workspaceUid)}`, json("POST", input));
export const deleteProperty = (workspaceUid: string, uid: string): Promise<void> => apiFetch(`/mail/crm/properties/${enc(workspaceUid)}/${enc(uid)}`, json("DELETE"));

export const listNotes = (workspaceUid: string, subjectUid: string): Promise<Note[]> =>
    apiFetch(`/mail/crm/notes/${enc(workspaceUid)}?limit=200&subjectUid=${enc(subjectUid)}`);
export const createNote = (workspaceUid: string, input: { subjectType: SubjectType; subjectUid: string; body: string }): Promise<Note> =>
    apiFetch(`/mail/crm/notes/${enc(workspaceUid)}`, json("POST", input));
export const deleteNote = (workspaceUid: string, uid: string): Promise<void> => apiFetch(`/mail/crm/notes/${enc(workspaceUid)}/${enc(uid)}`, json("DELETE"));

export function listTasks(workspaceUid: string, query: { status?: TaskStatus; assigneeUserUid?: string; subjectUid?: string } = {}): Promise<Task[]> {
    const params: string = Object.entries(query)
        .filter(([, value]) => value)
        .map(([key, value]) => `&${key}=${enc(value)}`)
        .join("");
    return apiFetch(`/mail/crm/tasks/${enc(workspaceUid)}?limit=200${params}`);
}
export const createTask = (workspaceUid: string, input: Partial<Task>): Promise<Task> => apiFetch(`/mail/crm/tasks/${enc(workspaceUid)}`, json("POST", input));
export const updateTask = (workspaceUid: string, uid: string, input: Partial<Task>): Promise<Task> =>
    apiFetch(`/mail/crm/tasks/${enc(workspaceUid)}/${enc(uid)}`, json("PUT", input));
export const deleteTask = (workspaceUid: string, uid: string): Promise<void> => apiFetch(`/mail/crm/tasks/${enc(workspaceUid)}/${enc(uid)}`, json("DELETE"));

export const listTimeline = (workspaceUid: string, subjectType: SubjectType, subjectUid: string): Promise<TimelineEvent[]> =>
    apiFetch(`/mail/crm/timeline/${enc(workspaceUid)}/${subjectType}/${enc(subjectUid)}?limit=100`);

// Lists, subscriptions, suppressions, forms

export interface MailingList extends Stored {
    name: string;
    description?: string;
    publicName: string;
    publicDescription?: string;
    doubleOptIn: boolean;
    visible: boolean;
    senderUid?: string;
    subscribedCount: number;
    pendingCount: number;
}

export type SubscriptionStatus = "pending" | "subscribed" | "unsubscribed";

export interface Subscription extends Stored {
    listUid: string;
    contactUid: string;
    status: SubscriptionStatus;
    source: string;
    consentAt?: string;
    unsubscribedAt?: string;
}

export interface Suppression extends Stored {
    email: string;
    reason: "hard_bounce" | "complaint" | "manual";
    note?: string;
}

export interface FormField {
    target: string;
    label: string;
    required: boolean;
}

export interface CrmForm extends Stored {
    name: string;
    title: string;
    description?: string;
    fields: FormField[];
    listUids: string[];
    doubleOptIn: boolean;
    senderUid?: string;
    successMessage: string;
    redirectUrl?: string;
    tags: string[];
    enabled: boolean;
    submissionCount: number;
}

export const listLists = (workspaceUid: string): Promise<MailingList[]> => apiFetch(`/mail/crm/lists/${enc(workspaceUid)}?limit=200`);
export const createList = (workspaceUid: string, input: Partial<MailingList>): Promise<MailingList> => apiFetch(`/mail/crm/lists/${enc(workspaceUid)}`, json("POST", input));
export const updateList = (workspaceUid: string, uid: string, input: Partial<MailingList>): Promise<MailingList> =>
    apiFetch(`/mail/crm/lists/${enc(workspaceUid)}/${enc(uid)}`, json("PUT", input));
export const deleteList = (workspaceUid: string, uid: string): Promise<void> => apiFetch(`/mail/crm/lists/${enc(workspaceUid)}/${enc(uid)}`, json("DELETE"));

export const listSubscriptions = (workspaceUid: string, contactUid: string): Promise<Subscription[]> =>
    apiFetch(`/mail/crm/subscriptions/${enc(workspaceUid)}?limit=500&contactUid=${enc(contactUid)}`);
export const setSubscriptions = (workspaceUid: string, input: { listUid: string; contactUids: string[]; status: "subscribed" | "unsubscribed" }): Promise<{ changed: number }> =>
    apiFetch(`/mail/crm/subscriptions/${enc(workspaceUid)}`, json("POST", input));

export const listSuppressions = (workspaceUid: string): Promise<Suppression[]> => apiFetch(`/mail/crm/suppressions/${enc(workspaceUid)}?limit=200`);
export const createSuppression = (workspaceUid: string, input: { email: string; note?: string }): Promise<Suppression> =>
    apiFetch(`/mail/crm/suppressions/${enc(workspaceUid)}`, json("POST", input));
export const deleteSuppression = (workspaceUid: string, uid: string): Promise<void> => apiFetch(`/mail/crm/suppressions/${enc(workspaceUid)}/${enc(uid)}`, json("DELETE"));

export const listForms = (workspaceUid: string): Promise<CrmForm[]> => apiFetch(`/mail/crm/forms/${enc(workspaceUid)}?limit=200`);
export const createForm = (workspaceUid: string, input: Partial<CrmForm>): Promise<CrmForm> => apiFetch(`/mail/crm/forms/${enc(workspaceUid)}`, json("POST", input));
export const updateForm = (workspaceUid: string, uid: string, input: Partial<CrmForm>): Promise<CrmForm> =>
    apiFetch(`/mail/crm/forms/${enc(workspaceUid)}/${enc(uid)}`, json("PUT", input));
export const deleteForm = (workspaceUid: string, uid: string): Promise<void> => apiFetch(`/mail/crm/forms/${enc(workspaceUid)}/${enc(uid)}`, json("DELETE"));

// Imports

export const listImports = (workspaceUid: string): Promise<CrmImport[]> => apiFetch(`/mail/crm/imports/${enc(workspaceUid)}?limit=50`);
export const getImport = (workspaceUid: string, uid: string): Promise<CrmImport> => apiFetch(`/mail/crm/imports/${enc(workspaceUid)}/${enc(uid)}`);
export const startImport = (
    workspaceUid: string,
    uid: string,
    input: { mapping: ImportColumnMapping[]; updateExisting: boolean; tags: string[]; listUid?: string },
): Promise<CrmImport> =>
    apiFetch(`/mail/crm/imports/${enc(workspaceUid)}/${enc(uid)}/start`, json("POST", input));
export const deleteImport = (workspaceUid: string, uid: string): Promise<void> => apiFetch(`/mail/crm/imports/${enc(workspaceUid)}/${enc(uid)}`, json("DELETE"));

/** Uploads a CSV file for import. */
export async function uploadImport(workspaceUid: string, objectType: CrmObjectType, file: File): Promise<ImportUpload> {
    const response: Response = await fetch(apiUrl(`/mail/crm/imports/${enc(workspaceUid)}?objectType=${objectType}&fileName=${enc(file.name)}`), {
        method: "POST",
        credentials: "include",
        headers: withCsrfHeader({ "Content-Type": "text/csv" }),
        body: file,
    });
    if (!response.ok) {
        throw await responseError(response);
    }
    return (await response.json()) as ImportUpload;
}

/** An `ApiRequestError` from a failed raw `fetch()`, with the server's message when it sent one. */
async function responseError(response: Response): Promise<ApiRequestError> {
    let message: string = `Request failed (${response.status}).`;
    try {
        const body: any = await response.json();
        message = typeof body?.message === "string" ? body.message : message;
    } catch {
        // Not JSON: keep the generic message.
    }
    return new ApiRequestError(message, response.status);
}

/** A readable message for a failed call. */
export function errorMessage(err: unknown, fallback: string): string {
    return err instanceof ApiRequestError ? err.message : fallback;
}

// Templates

export type Align = "left" | "center" | "right";
export type SocialNetwork = "facebook" | "x" | "linkedin" | "instagram" | "youtube" | "github" | "web";

interface BlockBase {
    id: string;
    align?: Align;
    padding?: number;
}
export interface TextBlock extends BlockBase {
    type: "text";
    html: string;
    color?: string;
    fontSize?: number;
}
export interface HeadingBlock extends BlockBase {
    type: "heading";
    text: string;
    level: 1 | 2 | 3;
    color?: string;
}
export interface ImageBlock extends BlockBase {
    type: "image";
    src: string;
    alt: string;
    href?: string;
    width?: number;
}
export interface ButtonBlock extends BlockBase {
    type: "button";
    text: string;
    href: string;
    color?: string;
    backgroundColor?: string;
    borderRadius?: number;
}
export interface DividerBlock extends BlockBase {
    type: "divider";
    color?: string;
    thickness?: number;
}
export interface SpacerBlock extends BlockBase {
    type: "spacer";
    height: number;
}
export interface SocialBlock extends BlockBase {
    type: "social";
    links: { network: SocialNetwork; href: string }[];
}
export interface HtmlBlock extends BlockBase {
    type: "html";
    html: string;
}
export interface FooterBlock extends BlockBase {
    type: "footer";
    note?: string;
    color?: string;
}
export type DesignBlock = TextBlock | HeadingBlock | ImageBlock | ButtonBlock | DividerBlock | SpacerBlock | SocialBlock | HtmlBlock | FooterBlock;
export type BlockType = DesignBlock["type"];

export interface DesignColumn {
    id: string;
    blocks: DesignBlock[];
}
export interface DesignSection {
    id: string;
    columns: DesignColumn[];
    backgroundColor?: string;
    padding?: number;
}
export interface DesignTheme {
    width: number;
    backgroundColor: string;
    contentBackgroundColor: string;
    textColor: string;
    linkColor: string;
    buttonColor: string;
    buttonTextColor: string;
    fontFamily: string;
}
export interface TemplateDesign {
    version?: number;
    theme: DesignTheme;
    sections: DesignSection[];
}

export interface EmailTemplate extends Stored {
    workspaceUid: string;
    name: string;
    category?: string | null;
    subject: string;
    preheader?: string | null;
    design: TemplateDesign;
    /** The design has an unsubscribe link (a footer block, or a `{{ links.unsubscribe }}` link); campaigns require one. */
    hasUnsubscribeLink: boolean;
}

export interface SavedBlock extends Stored {
    workspaceUid: string;
    name: string;
    blocks: DesignBlock[];
}

export interface RenderedEmail {
    subject: string;
    html: string;
    text: string;
}

export interface MergeTag {
    tag: string;
    label: string;
}

/** A template's changes; `version` refuses the change when the template was saved elsewhere since. */
export type TemplateInput = Partial<Pick<EmailTemplate, "name" | "category" | "subject" | "preheader" | "design" | "version">>;

/** A page of the workspace's templates, by name. */
export const searchTemplates = (workspaceUid: string, page: number, limit: number = 100): Promise<SearchResult<EmailTemplate>> =>
    apiFetch(`/mail/crm/templates/${enc(workspaceUid)}/search`, json("POST", { sort: { field: "name", direction: "asc" }, limit, page }));
export const getTemplate = (workspaceUid: string, uid: string): Promise<EmailTemplate> => apiFetch(`/mail/crm/templates/${enc(workspaceUid)}/${enc(uid)}`);
export const createTemplate = (workspaceUid: string, input: TemplateInput): Promise<EmailTemplate> =>
    apiFetch(`/mail/crm/templates/${enc(workspaceUid)}`, json("POST", input));
export const updateTemplate = (workspaceUid: string, uid: string, input: TemplateInput): Promise<EmailTemplate> =>
    apiFetch(`/mail/crm/templates/${enc(workspaceUid)}/${enc(uid)}`, json("PUT", input));
export const deleteTemplate = (workspaceUid: string, uid: string): Promise<void> => apiFetch(`/mail/crm/templates/${enc(workspaceUid)}/${enc(uid)}`, json("DELETE"));
export const duplicateTemplate = (workspaceUid: string, uid: string): Promise<EmailTemplate> =>
    apiFetch(`/mail/crm/templates/${enc(workspaceUid)}/${enc(uid)}/duplicate`, json("POST", {}));
export const renderTemplate = (
    workspaceUid: string,
    input: { design: TemplateDesign; subject: string; preheader?: string; contactUid?: string },
): Promise<RenderedEmail> => apiFetch(`/mail/crm/templates/${enc(workspaceUid)}/render`, json("POST", input));
export const sendTestTemplate = (workspaceUid: string, uid: string, input: { to: string; senderUid: string; contactUid?: string }): Promise<{ sent: string }> =>
    apiFetch(`/mail/crm/templates/${enc(workspaceUid)}/${enc(uid)}/test`, json("POST", input));
export const listMergeTags = (workspaceUid: string): Promise<MergeTag[]> => apiFetch(`/mail/crm/templates/${enc(workspaceUid)}/merge-tags`);
export const listSavedBlocks = (workspaceUid: string): Promise<SavedBlock[]> => apiFetch(`/mail/crm/saved-blocks/${enc(workspaceUid)}?limit=200`);
export const createSavedBlock = (workspaceUid: string, input: { name: string; blocks: DesignBlock[] }): Promise<SavedBlock> =>
    apiFetch(`/mail/crm/saved-blocks/${enc(workspaceUid)}`, json("POST", input));
export const deleteSavedBlock = (workspaceUid: string, uid: string): Promise<void> => apiFetch(`/mail/crm/saved-blocks/${enc(workspaceUid)}/${enc(uid)}`, json("DELETE"));

// Campaigns

export type CampaignStatus = "draft" | "scheduled" | "preparing" | "sending" | "paused" | "sent" | "cancelled" | "failed";
export type AbMetric = "open" | "click" | "reply";

export interface CampaignVariant {
    id: string;
    subject?: string;
    templateUid?: string;
}

export interface AbTest {
    variants: CampaignVariant[];
    testPercent: number;
    metric: AbMetric;
    testHours: number;
    winnerId?: string;
    decidedAt?: string;
}

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

export interface CampaignStats extends CampaignCounts {
    variants?: Record<string, CampaignCounts>;
}

export interface Campaign extends Stored {
    workspaceUid: string;
    name: string;
    status: CampaignStatus;
    templateUid?: string | null;
    senderUid?: string | null;
    listUids: string[];
    excludeListUids: string[];
    segmentUids: string[];
    excludeSegmentUids: string[];
    trackOpens: boolean;
    trackClicks: boolean;
    abTest?: AbTest | null;
    scheduledAt?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
    recipientCount: number;
    stats: CampaignStats;
    error?: string | null;
}

export interface CampaignProblem {
    field: string;
    message: string;
}

export type SendStatus = "queued" | "held" | "sent" | "failed" | "suppressed" | "cancelled";

/** One message of a campaign, as its recipients list shows it. */
export interface CampaignRecipient extends Stored {
    contactUid: string;
    email: string;
    variantId: string;
    status: SendStatus;
    sentAt?: string;
    error?: string;
    firstOpenedAt?: string;
    openCount: number;
    firstClickedAt?: string;
    clickCount: number;
    repliedAt?: string;
    bouncedAt?: string;
    bounceType?: string;
    complainedAt?: string;
    unsubscribedAt?: string;
}

export interface LinkClicks {
    url: string;
    clicks: number;
    uniqueClicks: number;
}

export interface CampaignReport {
    campaign: Campaign;
    stats: CampaignStats;
    links: LinkClicks[];
}

export type CampaignInput = Partial<
    Pick<Campaign, "name" | "templateUid" | "senderUid" | "listUids" | "excludeListUids" | "segmentUids" | "excludeSegmentUids" | "trackOpens" | "trackClicks" | "abTest" | "version">
>;

const campaignPath = (workspaceUid: string, suffix: string = "") => `/mail/crm/campaigns/${enc(workspaceUid)}${suffix}`;

/** A page of the workspace's campaigns, newest first. */
export const searchCampaigns = (workspaceUid: string, page: number, limit: number = 50): Promise<SearchResult<Campaign>> =>
    apiFetch(campaignPath(workspaceUid, "/search"), json("POST", { limit, page }));
export const getCampaign = (workspaceUid: string, uid: string): Promise<Campaign> => apiFetch(campaignPath(workspaceUid, `/${enc(uid)}`));
export const createCampaign = (workspaceUid: string, input: CampaignInput): Promise<Campaign> => apiFetch(campaignPath(workspaceUid), json("POST", input));
export const updateCampaign = (workspaceUid: string, uid: string, input: CampaignInput): Promise<Campaign> =>
    apiFetch(campaignPath(workspaceUid, `/${enc(uid)}`), json("PUT", input));
export const deleteCampaign = (workspaceUid: string, uid: string): Promise<void> => apiFetch(campaignPath(workspaceUid, `/${enc(uid)}`), json("DELETE"));
export const duplicateCampaign = (workspaceUid: string, uid: string): Promise<Campaign> => apiFetch(campaignPath(workspaceUid, `/${enc(uid)}/duplicate`), json("POST", {}));
export const campaignChecklist = (workspaceUid: string, uid: string): Promise<CampaignProblem[]> => apiFetch(campaignPath(workspaceUid, `/${enc(uid)}/checklist`));
export const scheduleCampaign = (workspaceUid: string, uid: string, sendAt?: string): Promise<Campaign> =>
    apiFetch(campaignPath(workspaceUid, `/${enc(uid)}/schedule`), json("POST", sendAt ? { sendAt } : {}));
/** Moves a campaign along: back to a draft, paused, resumed or cancelled. */
export const changeCampaign = (workspaceUid: string, uid: string, action: "unschedule" | "pause" | "resume" | "cancel"): Promise<Campaign> =>
    apiFetch(campaignPath(workspaceUid, `/${enc(uid)}/${action}`), json("POST", {}));
export const campaignAudience = (
    workspaceUid: string,
    input: { listUids: string[]; excludeListUids: string[]; segmentUids?: string[]; excludeSegmentUids?: string[] },
): Promise<{ count: number; capped: boolean }> =>
    apiFetch(campaignPath(workspaceUid, "/audience"), json("POST", input));
export const campaignReport = (workspaceUid: string, uid: string): Promise<CampaignReport> => apiFetch(campaignPath(workspaceUid, `/${enc(uid)}/report`));
export const campaignRecipients = (
    workspaceUid: string,
    uid: string,
    query: { status?: SendStatus; engagement?: string; q?: string; page: number; limit?: number },
): Promise<SearchResult<CampaignRecipient>> => apiFetch(campaignPath(workspaceUid, `/${enc(uid)}/recipients`), json("POST", query));

// Segments and lead scoring

export type SegmentKind = "dynamic" | "static";

export interface Segment extends Stored {
    workspaceUid: string;
    name: string;
    description?: string | null;
    kind: SegmentKind;
    filter: FilterNode;
    memberCount: number;
    capped: boolean;
    refreshedAt?: string | null;
}

export interface SegmentPreview {
    count: number;
    capped: boolean;
    contacts: Pick<Contact, "uid" | "email" | "firstName" | "lastName">[];
}

export type ScoringKind = "property" | "activity";
export type ScoringActivity = "opened" | "clicked" | "replied" | "form_submitted" | "subscribed" | "unsubscribed" | "bounced";

export interface ScoringRule extends Stored {
    workspaceUid: string;
    name: string;
    enabled: boolean;
    kind: ScoringKind;
    filter?: FilterNode | null;
    activity?: ScoringActivity | null;
    points: number;
    maxPoints?: number | null;
    withinDays?: number | null;
}

export type SegmentInput = Partial<Pick<Segment, "name" | "description" | "kind" | "filter">>;
export type ScoringRuleInput = Partial<Pick<ScoringRule, "name" | "enabled" | "kind" | "filter" | "activity" | "points" | "maxPoints" | "withinDays">>;

export const listSegments = (workspaceUid: string): Promise<Segment[]> => apiFetch(`/mail/crm/segments/${enc(workspaceUid)}?limit=200`);
export const createSegment = (workspaceUid: string, input: SegmentInput): Promise<Segment> => apiFetch(`/mail/crm/segments/${enc(workspaceUid)}`, json("POST", input));
export const updateSegment = (workspaceUid: string, uid: string, input: SegmentInput): Promise<Segment> =>
    apiFetch(`/mail/crm/segments/${enc(workspaceUid)}/${enc(uid)}`, json("PUT", input));
export const deleteSegment = (workspaceUid: string, uid: string): Promise<void> => apiFetch(`/mail/crm/segments/${enc(workspaceUid)}/${enc(uid)}`, json("DELETE"));
export const refreshSegment = (workspaceUid: string, uid: string): Promise<Segment> => apiFetch(`/mail/crm/segments/${enc(workspaceUid)}/${enc(uid)}/refresh`, json("POST", {}));
export const previewSegment = (workspaceUid: string, filter: FilterNode): Promise<SegmentPreview> =>
    apiFetch(`/mail/crm/segments/${enc(workspaceUid)}/preview`, json("POST", { filter }));

export const listScoringRules = (workspaceUid: string): Promise<ScoringRule[]> => apiFetch(`/mail/crm/scoring-rules/${enc(workspaceUid)}?limit=50`);
export const createScoringRule = (workspaceUid: string, input: ScoringRuleInput): Promise<ScoringRule> =>
    apiFetch(`/mail/crm/scoring-rules/${enc(workspaceUid)}`, json("POST", input));
export const updateScoringRule = (workspaceUid: string, uid: string, input: ScoringRuleInput): Promise<ScoringRule> =>
    apiFetch(`/mail/crm/scoring-rules/${enc(workspaceUid)}/${enc(uid)}`, json("PUT", input));
export const deleteScoringRule = (workspaceUid: string, uid: string): Promise<void> =>
    apiFetch(`/mail/crm/scoring-rules/${enc(workspaceUid)}/${enc(uid)}`, json("DELETE"));
export const recalculateScores = (workspaceUid: string): Promise<{ changed: number }> =>
    apiFetch(`/mail/crm/scoring-rules/${enc(workspaceUid)}/recalculate`, json("POST", {}));

// Automations

export type NodeType =
    | "trigger"
    | "delay"
    | "wait"
    | "condition"
    | "split"
    | "send_email"
    | "set_field"
    | "add_tag"
    | "remove_tag"
    | "subscribe"
    | "unsubscribe"
    | "create_task"
    | "notify"
    | "enroll"
    | "webhook"
    | "exit";

export interface AutomationNode {
    id: string;
    type: NodeType;
    config: Record<string, any>;
}

export interface AutomationEdge {
    from: string;
    to: string;
    port: string;
}

export interface AutomationGraph {
    nodes: AutomationNode[];
    edges: AutomationEdge[];
}

export type AutomationStatus = "draft" | "active" | "paused";
export type AutomationReentry = "never" | "after_exit";
export type EnrollmentState = "active" | "waiting" | "completed" | "exited" | "failed";

export interface Automation extends Stored {
    workspaceUid: string;
    name: string;
    description?: string | null;
    status: AutomationStatus;
    graph: AutomationGraph;
    reentry: AutomationReentry;
    goalFilter?: FilterNode | null;
    publishedVersionUid?: string | null;
    publishedAt?: string | null;
}

export interface AutomationReport {
    states: Record<EnrollmentState, number>;
    nodes: Record<string, { current: number; sent?: number; opened?: number; clicked?: number; replied?: number }>;
}

export interface Enrollment extends Stored {
    automationUid: string;
    contactUid: string;
    email?: string;
    state: EnrollmentState;
    currentNodeId: string;
    nextRunAt: string;
    enteredAt: string;
    finishedAt?: string | null;
    error?: string | null;
    history: { nodeId: string; at: string; outcome: string }[];
}

export type AutomationInput = Partial<Pick<Automation, "name" | "description" | "graph" | "reentry" | "goalFilter" | "version">>;

const automationPath = (workspaceUid: string, suffix: string = "") => `/mail/crm/automations/${enc(workspaceUid)}${suffix}`;

export const listAutomations = (workspaceUid: string): Promise<Automation[]> => apiFetch(automationPath(workspaceUid, "?limit=200"));
export const getAutomation = (workspaceUid: string, uid: string): Promise<Automation> => apiFetch(automationPath(workspaceUid, `/${enc(uid)}`));
export const createAutomation = (workspaceUid: string, input: AutomationInput): Promise<Automation> => apiFetch(automationPath(workspaceUid), json("POST", input));
export const updateAutomation = (workspaceUid: string, uid: string, input: AutomationInput): Promise<Automation> =>
    apiFetch(automationPath(workspaceUid, `/${enc(uid)}`), json("PUT", input));
export const deleteAutomation = (workspaceUid: string, uid: string): Promise<void> => apiFetch(automationPath(workspaceUid, `/${enc(uid)}`), json("DELETE"));
/** Publishes, pauses or resumes an automation. */
export const changeAutomation = (workspaceUid: string, uid: string, action: "publish" | "pause" | "resume"): Promise<Automation> =>
    apiFetch(automationPath(workspaceUid, `/${enc(uid)}/${action}`), json("POST", {}));
export const enrollInAutomation = (workspaceUid: string, uid: string, contactUids: string[]): Promise<{ enrolled: number }> =>
    apiFetch(automationPath(workspaceUid, `/${enc(uid)}/enroll`), json("POST", { contactUids }));
export const automationReport = (workspaceUid: string, uid: string): Promise<AutomationReport> => apiFetch(automationPath(workspaceUid, `/${enc(uid)}/report`));
export const listEnrollments = (
    workspaceUid: string,
    uid: string,
    query: { state?: EnrollmentState; contactUid?: string; page: number; limit?: number },
): Promise<SearchResult<Enrollment>> => apiFetch(automationPath(workspaceUid, `/${enc(uid)}/enrollments`), json("POST", query));
export const exitEnrollment = (workspaceUid: string, uid: string, enrollmentUid: string): Promise<Enrollment> =>
    apiFetch(automationPath(workspaceUid, `/${enc(uid)}/enrollments/${enc(enrollmentUid)}/exit`), json("POST", {}));

// Pipelines and deals

export type StageKind = "open" | "won" | "lost";
export type DealStatus = "open" | "won" | "lost";

export interface PipelineStage {
    id: string;
    name: string;
    probability: number;
    kind: StageKind;
    rottingDays?: number | null;
}

export interface Pipeline extends Stored {
    workspaceUid: string;
    name: string;
    stages: PipelineStage[];
    isDefault: boolean;
}

export interface Deal extends Stored {
    workspaceUid: string;
    name: string;
    amount: number;
    currency: string;
    pipelineUid: string;
    stageId: string;
    status: DealStatus;
    ownerUserUid?: string | null;
    contactUids: string[];
    companyUid?: string | null;
    expectedCloseDate?: string | null;
    closedAt?: string | null;
    lostReason?: string | null;
    stageChangedAt: string;
    stageHistory: { stageId: string; at: string; userUid?: string }[];
}

export interface Forecast {
    stages: { stageId: string; count: number; amount: number; weighted: number }[];
    open: { count: number; amount: number; weighted: number };
    won: { count: number; amount: number };
    lost: { count: number; amount: number };
    winRate?: number;
    averageDaysToWin?: number;
}

export type PipelineInput = Partial<Pick<Pipeline, "name" | "isDefault">> & { stages?: Partial<PipelineStage>[] };
export type DealInput = Partial<
    Pick<Deal, "name" | "amount" | "currency" | "pipelineUid" | "stageId" | "ownerUserUid" | "contactUids" | "companyUid" | "expectedCloseDate" | "lostReason" | "version">
>;

export const listPipelines = (workspaceUid: string): Promise<Pipeline[]> => apiFetch(`/mail/crm/pipelines/${enc(workspaceUid)}?limit=50`);
export const createPipeline = (workspaceUid: string, input: PipelineInput): Promise<Pipeline> => apiFetch(`/mail/crm/pipelines/${enc(workspaceUid)}`, json("POST", input));
export const updatePipeline = (workspaceUid: string, uid: string, input: PipelineInput): Promise<Pipeline> =>
    apiFetch(`/mail/crm/pipelines/${enc(workspaceUid)}/${enc(uid)}`, json("PUT", input));
export const deletePipeline = (workspaceUid: string, uid: string): Promise<void> => apiFetch(`/mail/crm/pipelines/${enc(workspaceUid)}/${enc(uid)}`, json("DELETE"));

/** A pipeline's deals, or a contact's (`contactUid`). */
export function listDeals(workspaceUid: string, query: { pipelineUid?: string; status?: DealStatus; ownerUserUid?: string; contactUid?: string } = {}): Promise<Deal[]> {
    const params = new URLSearchParams({ limit: "200" });
    for (const [key, value] of Object.entries(query)) {
        if (value) {
            params.set(key, value);
        }
    }
    return apiFetch(`/mail/crm/deals/${enc(workspaceUid)}?${params.toString()}`);
}
export const getDeal = (workspaceUid: string, uid: string): Promise<Deal> => apiFetch(`/mail/crm/deals/${enc(workspaceUid)}/${enc(uid)}`);
export const createDeal = (workspaceUid: string, input: DealInput): Promise<Deal> => apiFetch(`/mail/crm/deals/${enc(workspaceUid)}`, json("POST", input));
export const updateDeal = (workspaceUid: string, uid: string, input: DealInput): Promise<Deal> => apiFetch(`/mail/crm/deals/${enc(workspaceUid)}/${enc(uid)}`, json("PUT", input));
export const deleteDeal = (workspaceUid: string, uid: string): Promise<void> => apiFetch(`/mail/crm/deals/${enc(workspaceUid)}/${enc(uid)}`, json("DELETE"));
export const dealForecast = (workspaceUid: string, pipelineUid: string, days: number = 90): Promise<Forecast> =>
    apiFetch(`/mail/crm/deals/${enc(workspaceUid)}/forecast?pipelineUid=${enc(pipelineUid)}&days=${days}`);

// Reports

export interface EmailDay {
    date: string;
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    unsubscribed: number;
}

export interface EmailReport {
    days: EmailDay[];
    totals: { sent: number; opened: number; clicked: number; replied: number; bounced: number; unsubscribed: number; complained: number };
    domains: { domain: string; sent: number; opened: number; clicked: number }[];
}

export interface GrowthReport {
    days: { date: string; contacts: number; subscribed: number; unsubscribed: number }[];
    contacts: number;
    lists: { uid: string; name: string; subscribed: number }[];
}

export interface SalesReport {
    days: { date: string; created: number; won: number; wonAmount: number; lost: number }[];
    open: { count: number; amount: number };
    won: { count: number; amount: number };
    lost: number;
}

export const emailReport = (workspaceUid: string, days: number): Promise<EmailReport> => apiFetch(`/mail/crm/analytics/${enc(workspaceUid)}/email?days=${days}`);
export const growthReport = (workspaceUid: string, days: number): Promise<GrowthReport> => apiFetch(`/mail/crm/analytics/${enc(workspaceUid)}/growth?days=${days}`);
export const salesReport = (workspaceUid: string, days: number, pipelineUid?: string): Promise<SalesReport> =>
    apiFetch(`/mail/crm/analytics/${enc(workspaceUid)}/sales?days=${days}${pipelineUid ? `&pipelineUid=${enc(pipelineUid)}` : ""}`);

// Webhooks and API keys

export interface WebhookEndpoint extends Stored {
    workspaceUid: string;
    url: string;
    events: string[];
    enabled: boolean;
    description?: string | null;
    failureCount: number;
    lastDeliveryAt?: string;
    lastError?: string | null;
    secretHint: string;
    /** Only when it was just made. */
    secret?: string;
}

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed";

export interface WebhookDelivery extends Stored {
    endpointUid: string;
    eventType: string;
    status: WebhookDeliveryStatus;
    attempts: number;
    responseStatus?: number;
    lastError?: string | null;
    deliveredAt?: string;
}

/** The event types an endpoint can take (besides `*`, all of them). */
export const WEBHOOK_EVENTS: readonly string[] = [
    "contact.created",
    "contact.updated",
    "list.subscribed",
    "list.unsubscribed",
    "form.submitted",
    "segment.entered",
    "segment.left",
    "email.sent",
    "email.opened",
    "email.clicked",
    "email.replied",
    "email.bounced",
    "email.unsubscribed",
    "deal.created",
    "deal.stage_changed",
    "deal.won",
    "deal.lost",
    "custom",
    "automation.webhook",
];

export type WebhookInput = { url?: string; events?: string[]; enabled?: boolean; description?: string | null };

export const listWebhooks = (workspaceUid: string): Promise<WebhookEndpoint[]> => apiFetch(`/mail/crm/webhooks/${enc(workspaceUid)}?limit=50`);
export const createWebhook = (workspaceUid: string, input: WebhookInput): Promise<WebhookEndpoint> => apiFetch(`/mail/crm/webhooks/${enc(workspaceUid)}`, json("POST", input));
export const updateWebhook = (workspaceUid: string, uid: string, input: WebhookInput): Promise<WebhookEndpoint> =>
    apiFetch(`/mail/crm/webhooks/${enc(workspaceUid)}/${enc(uid)}`, json("PUT", input));
export const deleteWebhook = (workspaceUid: string, uid: string): Promise<void> => apiFetch(`/mail/crm/webhooks/${enc(workspaceUid)}/${enc(uid)}`, json("DELETE"));
export const rotateWebhookSecret = (workspaceUid: string, uid: string): Promise<{ secret: string }> =>
    apiFetch(`/mail/crm/webhooks/${enc(workspaceUid)}/${enc(uid)}/secret`, json("POST"));
export const testWebhook = (workspaceUid: string, uid: string): Promise<{ status?: number; error?: string }> =>
    apiFetch(`/mail/crm/webhooks/${enc(workspaceUid)}/${enc(uid)}/test`, json("POST"));
export const webhookDeliveries = (workspaceUid: string, uid: string): Promise<WebhookDelivery[]> => apiFetch(`/mail/crm/webhooks/${enc(workspaceUid)}/${enc(uid)}/deliveries`);

export type ApiKeyScope = "contacts" | "subscriptions" | "events";
export const API_KEY_SCOPES: readonly ApiKeyScope[] = ["contacts", "subscriptions", "events"];

export interface ApiKey extends Stored {
    workspaceUid: string;
    name: string;
    prefix: string;
    scopes: ApiKeyScope[];
    lastUsedAt?: string;
    createdByUserUid: string;
    /** Only when it was just made. */
    key?: string;
}

export const listApiKeys = (workspaceUid: string): Promise<ApiKey[]> => apiFetch(`/mail/crm/api-keys/${enc(workspaceUid)}?limit=50`);
export const createApiKey = (workspaceUid: string, input: { name: string; scopes: ApiKeyScope[] }): Promise<ApiKey> =>
    apiFetch(`/mail/crm/api-keys/${enc(workspaceUid)}`, json("POST", input));
export const updateApiKey = (workspaceUid: string, uid: string, input: { name?: string; scopes?: ApiKeyScope[] }): Promise<ApiKey> =>
    apiFetch(`/mail/crm/api-keys/${enc(workspaceUid)}/${enc(uid)}`, json("PUT", input));
export const deleteApiKey = (workspaceUid: string, uid: string): Promise<void> => apiFetch(`/mail/crm/api-keys/${enc(workspaceUid)}/${enc(uid)}`, json("DELETE"));

// Deployment administration

export interface AdminWorkspace {
    uid: string;
    name: string;
    dateCreated: string;
    members: number;
    contacts: number;
    campaignsSent: number;
    sendingDisabled: boolean;
}

export interface AdminStats {
    workspaces: number;
    contacts: number;
    sentLastDay: number;
    queued: number;
}

export const adminStats = (): Promise<AdminStats> => apiFetch("/mail/crm/admin/stats");
export const adminWorkspaces = (page: number, limit: number = 50): Promise<{ items: AdminWorkspace[]; total: number }> =>
    apiFetch(`/mail/crm/admin/workspaces?limit=${limit}&page=${page}`);
export const setWorkspaceSending = (uid: string, sendingDisabled: boolean): Promise<{ uid: string; sendingDisabled: boolean }> =>
    apiFetch(`/mail/crm/admin/workspaces/${enc(uid)}`, json("PUT", { sendingDisabled }));
