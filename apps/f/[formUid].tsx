///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { SignupFormPage } from "../shared/components/public/PublicPages.js";

/** A signup form (`/f/<formUid>`), linked to or embedded in another site. */
export default function FormPage({ params }: { params: { formUid: string } }) {
    return <SignupFormPage formUid={params.formUid} />;
}
