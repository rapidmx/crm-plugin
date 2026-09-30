///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { MONGO_MODELS } from "../../models/mongo/index.js";
import { ContactRouteMongo } from "../../routes/mongo/ContactRouteMongo.js";
import { CompanyRouteMongo } from "../../routes/mongo/CompanyRouteMongo.js";
import { CrmImportJob } from "../CrmImportJob.js";

/** `CrmImportJob` on a Mongo deployment. */
export class CrmImportJobMongo extends CrmImportJob {
    protected classes: CrmModelClasses = MONGO_MODELS;
    protected contactRouteClass: any = ContactRouteMongo;
    protected companyRouteClass: any = CompanyRouteMongo;
}
