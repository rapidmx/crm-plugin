///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { CompanyRouteMongo } from "../../routes/mongo/CompanyRouteMongo.js";
import { ContactRouteMongo } from "../../routes/mongo/ContactRouteMongo.js";
import { CrmImportJob } from "../CrmImportJob.js";

/** Imports queued CSV imports on a Mongo deployment - see `CrmImportJob`. */
export class CrmImportJobMongo extends CrmImportJob {
    protected classes: CrmModelClasses = MONGO_MODELS;
    protected contactRouteClass: any = ContactRouteMongo;
    protected companyRouteClass: any = CompanyRouteMongo;
}
