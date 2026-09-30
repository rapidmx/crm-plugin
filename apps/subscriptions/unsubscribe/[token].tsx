///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { UnsubscribePage } from "../../shared/components/public/PublicPages.js";

/** An unsubscribe link's landing page (`/subscriptions/unsubscribe/<token>`). */
export default function UnsubscribeLinkPage({ params }: { params: { token: string } }) {
    return <UnsubscribePage token={params.token} />;
}
