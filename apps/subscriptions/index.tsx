///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { MissingLinkPage } from "../shared/components/public/PublicPages.js";

/** `/subscriptions` without a token: nothing to show but a pointer to the emails' links. */
export default function SubscriptionsIndexPage() {
    return <MissingLinkPage title="Email preferences" />;
}
