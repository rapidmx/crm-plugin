///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { PublicPage } from "../shared/components/public/PublicPages.js";

/** `/f` without a form. */
export default function FormsIndexPage() {
    return (
        <PublicPage title="Sign up">
            <p className="text-sm">This form isn&apos;t available.</p>
        </PublicPage>
    );
}
