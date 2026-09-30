///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { CrmModelClasses } from "../../models/CrmModelClasses.js";
import { SQL_MODELS } from "../../models/sql/index.js";
import { SendDispatchJob } from "../SendDispatchJob.js";

/** `SendDispatchJob` on a SQL deployment. */
export class SendDispatchJobSQL extends SendDispatchJob {
    protected classes: CrmModelClasses = SQL_MODELS;
}
