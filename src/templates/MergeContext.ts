///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { CrmCompany, CrmContact, PropertyDefinition, PropertyValue, Workspace, WorkspaceSender } from "../models/types.js";
import { propertiesView } from "../util/PropertyValues.js";
import { MergeContext } from "./Render.js";

/** What a reader's merge context is made from. */
export interface MergeSources {
    workspace: Workspace;
    contact: CrmContact;
    contactValues?: Record<string, PropertyValue[]>;
    contactDefinitions: PropertyDefinition[];
    company?: CrmCompany;
    companyValues?: Record<string, PropertyValue[]>;
    companyDefinitions: PropertyDefinition[];
    sender?: WorkspaceSender;
    list?: { name: string };
    links: MergeContext["links"];
}

/**
 * The merge context of one reader: their contact fields (`contact.first_name`, `contact.full_name`, `contact.properties.<key>`...), their
 * company's (`company.name`...), the workspace's, the sender's, and the links to unsubscribe and manage preferences.
 */
export function buildMergeContext(sources: MergeSources): MergeContext {
    const { contact, company } = sources;
    const fullName: string = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
    return {
        contact: {
            email: contact.email,
            first_name: contact.firstName ?? "",
            last_name: contact.lastName ?? "",
            full_name: fullName,
            phone: contact.phone ?? "",
            job_title: contact.jobTitle ?? "",
            lifecycle_stage: contact.lifecycleStage,
            score: contact.score,
            tags: contact.tags,
            properties: propertiesView(sources.contactValues, sources.contactDefinitions),
        },
        company: company
            ? {
                  name: company.name,
                  domain: company.domain ?? "",
                  industry: company.industry ?? "",
                  website: company.website ?? "",
                  city: company.city ?? "",
                  country: company.country ?? "",
                  properties: propertiesView(sources.companyValues, sources.companyDefinitions),
              }
            : undefined,
        workspace: {
            name: sources.workspace.name,
            postal_address: sources.workspace.postalAddress ?? undefined,
            website: sources.workspace.website ?? undefined,
        },
        sender: sources.sender ? { name: sources.sender.fromName, address: sources.sender.fromAddress } : undefined,
        list: sources.list,
        links: sources.links,
    };
}

/** The merge tags a template can use, for the designer's merge tag picker. `properties.<key>` tags are added per workspace. */
export const MERGE_TAGS: readonly { tag: string; label: string }[] = [
    { tag: "contact.first_name", label: "First name" },
    { tag: "contact.last_name", label: "Last name" },
    { tag: "contact.full_name", label: "Full name" },
    { tag: "contact.email", label: "Email address" },
    { tag: "contact.job_title", label: "Job title" },
    { tag: "company.name", label: "Company name" },
    { tag: "workspace.name", label: "Your organization's name" },
    { tag: "workspace.postal_address", label: "Your postal address" },
    { tag: "sender.name", label: "Sender's name" },
    { tag: "links.unsubscribe", label: "Unsubscribe link" },
    { tag: "links.preferences", label: "Email preferences link" },
];
