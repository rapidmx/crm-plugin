///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Every route suite, run by both harnesses.
import { activitySuite } from "./activitySuite.js";
import { contactSuite } from "./contactSuite.js";
import { CrmTestContext } from "./context.js";
import { edgeSuite } from "./edgeSuite.js";
import { importSuite } from "./importSuite.js";
import { workspaceSuite } from "./workspaceSuite.js";

export function runCrmSuites(ctx: CrmTestContext): void {
    workspaceSuite(ctx);
    contactSuite(ctx);
    activitySuite(ctx);
    importSuite(ctx);
    edgeSuite(ctx);
}
