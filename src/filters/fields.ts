///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { EmailStatus, LifecycleStage } from "../models/types.js";
import { FilterField } from "./Filter.js";

const text: FilterField = { type: "string", stored: "record" };
const numeric: FilterField = { type: "number", stored: "record" };
const date: FilterField = { type: "date", stored: "record" };

/** The fields of a `CrmContact` a filter may compare (besides `tags` and custom properties - see `filterFields()`). */
export const CONTACT_FIELDS: Readonly<Record<string, FilterField>> = {
    email: text,
    firstName: text,
    lastName: text,
    phone: text,
    jobTitle: text,
    companyUid: text,
    ownerUserUid: text,
    lifecycleStage: { type: "string", stored: "record", options: Object.values(LifecycleStage) },
    leadStatus: text,
    score: numeric,
    source: text,
    emailStatus: { type: "string", stored: "record", options: Object.values(EmailStatus) },
    lastEngagedAt: date,
    dateCreated: date,
    dateModified: date,
};

/** The fields of a `CrmCompany` a filter may compare (besides `tags` and custom properties). */
export const COMPANY_FIELDS: Readonly<Record<string, FilterField>> = {
    name: text,
    domain: text,
    industry: text,
    employeeCount: numeric,
    phone: text,
    website: text,
    city: text,
    country: text,
    ownerUserUid: text,
    dateCreated: date,
    dateModified: date,
};

/** A contact's own fields, in the order exports list them. */
export const CONTACT_EXPORT_FIELDS: readonly string[] = [
    "email",
    "firstName",
    "lastName",
    "phone",
    "jobTitle",
    "companyUid",
    "ownerUserUid",
    "lifecycleStage",
    "leadStatus",
    "score",
    "source",
    "emailStatus",
    "lastEngagedAt",
    "dateCreated",
];

/** A company's own fields, in the order exports list them. */
export const COMPANY_EXPORT_FIELDS: readonly string[] = [
    "name",
    "domain",
    "industry",
    "employeeCount",
    "phone",
    "website",
    "city",
    "country",
    "ownerUserUid",
    "dateCreated",
];
