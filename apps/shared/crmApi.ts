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
    subjectType: CrmObjectType;
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
    subjectType?: CrmObjectType;
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
export const addSender = (uid: string, input: { fromAddress: string; fromName?: string; replyToAddress?: string }): Promise<WorkspaceSender> =>
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
export const createNote = (workspaceUid: string, input: { subjectType: CrmObjectType; subjectUid: string; body: string }): Promise<Note> =>
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

export const listTimeline = (workspaceUid: string, subjectType: CrmObjectType, subjectUid: string): Promise<TimelineEvent[]> =>
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
