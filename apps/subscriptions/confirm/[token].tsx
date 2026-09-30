///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { ConfirmPage } from "../../shared/components/public/PublicPages.js";

/** Double opt-in confirmation, from the link in a confirmation email (`/subscriptions/confirm/<token>`). */
export default function ConfirmSubscriptionPage({ params }: { params: { token: string } }) {
    return <ConfirmPage token={params.token} />;
}
