///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { Deal, PipelineStage } from "../../crmApi.js";

/** An amount in `currency`, in the reader's locale, without cents. A code the browser doesn't know is shown as a suffix. */
export function money(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
    } catch {
        return `${Math.round(amount).toLocaleString()} ${currency}`;
    }
}

/** How many whole days a deal has been in its stage. */
export function daysInStage(deal: Pick<Deal, "stageChangedAt">, now: Date = new Date()): number {
    return Math.floor((now.getTime() - new Date(deal.stageChangedAt).getTime()) / 86_400_000);
}

/** Whether an open deal has been in its stage longer than the stage's rotting days. */
export function isRotting(deal: Pick<Deal, "stageChangedAt" | "status">, stage: Pick<PipelineStage, "rottingDays"> | undefined, now: Date = new Date()): boolean {
    return deal.status === "open" && !!stage?.rottingDays && daysInStage(deal, now) > stage.rottingDays;
}
