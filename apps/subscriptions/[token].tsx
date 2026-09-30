///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { PreferenceCenterPage } from "../shared/components/public/PublicPages.js";

/** The preference center, from the link in every CRM email (`/subscriptions/<token>`). */
export default function PreferencesPage({ params }: { params: { token: string } }) {
    return <PreferenceCenterPage token={params.token} />;
}
