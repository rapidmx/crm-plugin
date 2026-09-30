///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import type { CampaignStatus } from "../../crmApi.js";

const STATUS: Record<CampaignStatus, { label: string; tone: string }> = {
    draft: { label: "Draft", tone: "bg-surface-alt text-text-muted" },
    scheduled: { label: "Scheduled", tone: "bg-primary-lightest text-primary-dark" },
    preparing: { label: "Preparing", tone: "bg-primary-lightest text-primary-dark" },
    sending: { label: "Sending", tone: "bg-primary-lightest text-primary-dark" },
    paused: { label: "Paused", tone: "bg-warning/15 text-warning" },
    sent: { label: "Sent", tone: "bg-success/15 text-success" },
    cancelled: { label: "Cancelled", tone: "bg-surface-alt text-text-muted" },
    failed: { label: "Failed", tone: "bg-danger/15 text-danger" },
};

/** A campaign's status as a small coloured label. */
export function StatusBadge({ status }: { status: CampaignStatus }) {
    const { label, tone } = STATUS[status];
    return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>;
}

/** `part` of `whole` as a percentage with one decimal, or a dash when `whole` is 0. */
export function percent(part: number, whole: number): string {
    return whole === 0 ? "–" : `${((part / whole) * 100).toFixed(1)}%`;
}

/** A date and time in the reader's locale, or a dash. */
export function when(value: string | null | undefined): string {
    return value ? new Date(value).toLocaleString() : "–";
}
