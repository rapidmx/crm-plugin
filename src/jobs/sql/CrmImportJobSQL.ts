///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { CompanyRouteSQL } from "../../routes/sql/CompanyRouteSQL.js";
import { ContactRouteSQL } from "../../routes/sql/ContactRouteSQL.js";
import { CrmImportJob } from "../CrmImportJob.js";

/** Imports queued CSV imports on a SQL deployment - see `CrmImportJob`. */
export class CrmImportJobSQL extends CrmImportJob {
    protected classes: CrmModelClasses = SQL_MODELS;
    protected contactRouteClass: any = ContactRouteSQL;
    protected companyRouteClass: any = CompanyRouteSQL;
}
