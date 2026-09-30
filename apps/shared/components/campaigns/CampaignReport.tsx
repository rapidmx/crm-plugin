///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import {
    Campaign,
    CampaignCounts,
    CampaignRecipient,
    CampaignReport as Report,
    SendStatus,
    campaignRecipients,
    campaignReport,
    changeCampaign,
    duplicateCampaign,
    errorMessage,
} from "../../crmApi.js";
import { INPUT_CLASS, useCrm } from "../CrmShell.js";
import { StatusBadge, percent, when } from "./campaignUi.js";

/** How often a campaign that's going out is reloaded. */
export const REFRESH_MS = 10_000;
const RECIPIENTS_PAGE = 50;
const LIVE: ReadonlySet<string> = new Set(["scheduled", "preparing", "sending"]);

const STATUSES: SendStatus[] = ["queued", "held", "sent", "failed", "suppressed", "cancelled"];
const ENGAGEMENTS: string[] = ["opened", "clicked", "replied", "bounced", "unsubscribed", "complained"];

function Tile({ label, value, detail }: { label: string; value: number; detail?: string }) {
    return (
        <div className="border border-border rounded-sm p-3">
            <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
            <div className="text-xl font-bold">{value.toLocaleString()}</div>
            {detail && <div className="text-xs text-text-muted">{detail}</div>}
        </div>
    );
}

/** The tiles of a campaign's numbers. Rates are of the messages sent. */
function Tiles({ counts }: { counts: CampaignCounts }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Tile label="Recipients" value={counts.recipients} detail={counts.suppressed ? `${counts.suppressed} skipped` : undefined} />
            <Tile label="Sent" value={counts.sent} detail={counts.failed ? `${counts.failed} failed` : undefined} />
            <Tile label="Opened" value={counts.opened} detail={percent(counts.opened, counts.sent)} />
            <Tile label="Clicked" value={counts.clicked} detail={percent(counts.clicked, counts.sent)} />
            <Tile label="Replied" value={counts.replied} detail={percent(counts.replied, counts.sent)} />
            <Tile label="Bounced" value={counts.bounced} detail={percent(counts.bounced, counts.sent)} />
            <Tile label="Unsubscribed" value={counts.unsubscribed} detail={percent(counts.unsubscribed, counts.sent)} />
            <Tile label="Spam complaints" value={counts.complained} detail={percent(counts.complained, counts.sent)} />
        </div>
    );
}

/**
 * A campaign that has gone (or is going) out: its numbers, the A/B test's variants and winner, its links by clicks, and its
 * recipients - filterable by what happened to their message. Pausing, resuming and cancelling while it goes out; reloaded every
 * `REFRESH_MS` until it's done.
 */
export default function CampaignReport({ campaign, onChanged }: { campaign: Campaign; onChanged: (campaign: Campaign) => void }) {
    const { workspace, canWrite, href } = useCrm();
    const [report, setReport] = useState<Report | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function load(): Promise<void> {
        try {
            const loaded: Report = await campaignReport(workspace.uid, campaign.uid);
            setReport(loaded);
            if (loaded.campaign.status !== campaign.status) {
                onChanged(loaded.campaign);
            }
        } catch (err) {
            setError(errorMessage(err, "Could not load the campaign's results."));
        }
    }

    useEffect(() => {
        void load();
        if (!LIVE.has(campaign.status)) {
            return;
        }
        const timer = window.setInterval(() => void load(), REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [campaign.uid, campaign.status]);

    async function act(action: "pause" | "resume" | "cancel"): Promise<void> {
        if (action === "cancel" && !window.confirm("Cancel the campaign? Messages not sent yet won't be.")) {
            return;
        }
        setBusy(true);
        try {
            onChanged(await changeCampaign(workspace.uid, campaign.uid, action));
        } catch (err) {
            setError(errorMessage(err, "Could not change the campaign."));
        }
        setBusy(false);
    }

    async function duplicate(): Promise<void> {
        try {
            const copy: Campaign = await duplicateCampaign(workspace.uid, campaign.uid);
            window.location.assign(href(`/crm/campaigns/${encodeURIComponent(copy.uid)}`));
        } catch (err) {
            setError(errorMessage(err, "Could not duplicate the campaign."));
        }
    }

    const stats = report?.stats ?? campaign.stats;
    const test = campaign.abTest;
    return (
        <div className="max-w-6xl">
            <a href={href("/crm/campaigns")} className="text-sm text-primary-dark hover:underline">
                &larr; Campaigns
            </a>
            <div className="flex flex-wrap items-center gap-3 mt-2 mb-1">
                <h1 className="text-lg font-bold tracking-tight">{campaign.name}</h1>
                <StatusBadge status={campaign.status} />
                {canWrite && (
                    <div className="flex gap-2 ml-auto">
                        {(campaign.status === "sending" || campaign.status === "preparing") && (
                            <Button type="button" variant="secondary" className="!w-auto !py-1.5" disabled={busy} onClick={() => void act("pause")}>
                                Pause
                            </Button>
                        )}
                        {campaign.status === "paused" && (
                            <Button type="button" variant="secondary" className="!w-auto !py-1.5" disabled={busy} onClick={() => void act("resume")}>
                                Resume
                            </Button>
                        )}
                        {LIVE.has(campaign.status) || campaign.status === "paused" ? (
                            <Button type="button" variant="secondary" className="!w-auto !py-1.5 !text-danger" disabled={busy} onClick={() => void act("cancel")}>
                                Cancel
                            </Button>
                        ) : null}
                        <Button type="button" variant="secondary" className="!w-auto !py-1.5" onClick={() => void duplicate()}>
                            Duplicate
                        </Button>
                    </div>
                )}
            </div>
            <p className="text-sm text-text-muted mb-4">
                Started {when(campaign.startedAt)}
                {campaign.finishedAt ? ` · finished ${when(campaign.finishedAt)}` : ""}
            </p>
            {campaign.error && <Alert>{campaign.error}</Alert>}
            {error && <Alert>{error}</Alert>}
            <Tiles counts={stats} />
            {test && (
                <section className="mb-6">
                    <h2 className="text-sm font-semibold mb-2">A/B test</h2>
                    <p className="text-sm text-text-muted mb-2">
                        {test.winnerId
                            ? `Variant ${test.winnerId} won by ${test.metric}s and went to the rest of the audience.`
                            : `${test.testPercent}% of the audience gets a variant; the one with the most ${test.metric}s after ${test.testHours} hours goes to the rest.`}
                    </p>
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr>
                                {["Variant", "Subject", "Sent", "Opened", "Clicked", "Replied"].map((heading) => (
                                    <th key={heading} className="text-left text-xs uppercase tracking-wide text-text-muted py-2 px-2.5 border-b border-border">
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {test.variants.map((variant) => {
                                const counts: CampaignCounts | undefined = stats.variants?.[variant.id];
                                return (
                                    <tr key={variant.id}>
                                        <td className="py-2 px-2.5 border-b border-border font-semibold">
                                            {variant.id}
                                            {test.winnerId === variant.id && <span className="ml-2 text-xs text-success">winner</span>}
                                        </td>
                                        <td className="py-2 px-2.5 border-b border-border">{variant.subject ?? "The template's"}</td>
                                        <td className="py-2 px-2.5 border-b border-border">{counts?.sent ?? 0}</td>
                                        <td className="py-2 px-2.5 border-b border-border">{percent(counts?.opened ?? 0, counts?.sent ?? 0)}</td>
                                        <td className="py-2 px-2.5 border-b border-border">{percent(counts?.clicked ?? 0, counts?.sent ?? 0)}</td>
                                        <td className="py-2 px-2.5 border-b border-border">{percent(counts?.replied ?? 0, counts?.sent ?? 0)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </section>
            )}
            {report && report.links.length > 0 && (
                <section className="mb-6">
                    <h2 className="text-sm font-semibold mb-2">Links</h2>
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr>
                                {["Link", "Clicks", "People"].map((heading) => (
                                    <th key={heading} className="text-left text-xs uppercase tracking-wide text-text-muted py-2 px-2.5 border-b border-border">
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {report.links.map((link) => (
                                <tr key={link.url}>
                                    <td className="py-2 px-2.5 border-b border-border break-all">{link.url}</td>
                                    <td className="py-2 px-2.5 border-b border-border">{link.clicks}</td>
                                    <td className="py-2 px-2.5 border-b border-border">{link.uniqueClicks}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}
            <Recipients campaign={campaign} />
        </div>
    );
}

/** A campaign's messages, filterable by status, by what happened, and by address. */
function Recipients({ campaign }: { campaign: Campaign }) {
    const { workspace, href } = useCrm();
    const [status, setStatus] = useState<SendStatus | "">("");
    const [engagement, setEngagement] = useState("");
    const [q, setQ] = useState("");
    const [page, setPage] = useState(0);
    const [result, setResult] = useState<{ items: CampaignRecipient[]; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let current = true;
        campaignRecipients(workspace.uid, campaign.uid, { status: status || undefined, engagement: engagement || undefined, q: q.trim() || undefined, page, limit: RECIPIENTS_PAGE }).then(
            (loaded) => current && setResult(loaded),
            (err) => current && setError(errorMessage(err, "Could not load the recipients.")),
        );
        return () => {
            current = false;
        };
    }, [campaign.uid, status, engagement, q, page]);

    const pages: number = result ? Math.max(1, Math.ceil(result.total / RECIPIENTS_PAGE)) : 1;
    return (
        <section>
            <h2 className="text-sm font-semibold mb-2">Recipients</h2>
            <div className="flex flex-wrap gap-2 mb-2">
                <select
                    aria-label="Status"
                    className={`${INPUT_CLASS} !w-40`}
                    value={status}
                    onChange={(event) => {
                        setStatus(event.target.value as SendStatus | "");
                        setPage(0);
                    }}
                >
                    <option value="">Any status</option>
                    {STATUSES.map((entry) => (
                        <option key={entry} value={entry}>
                            {entry}
                        </option>
                    ))}
                </select>
                <select
                    aria-label="What happened"
                    className={`${INPUT_CLASS} !w-40`}
                    value={engagement}
                    onChange={(event) => {
                        setEngagement(event.target.value);
                        setPage(0);
                    }}
                >
                    <option value="">Anything</option>
                    {ENGAGEMENTS.map((entry) => (
                        <option key={entry} value={entry}>
                            {entry}
                        </option>
                    ))}
                </select>
                <input
                    aria-label="Find an address"
                    placeholder="Find an address…"
                    className={`${INPUT_CLASS} !w-56`}
                    value={q}
                    onChange={(event) => {
                        setQ(event.target.value);
                        setPage(0);
                    }}
                />
            </div>
            {error && <Alert>{error}</Alert>}
            {result && result.items.length === 0 && <p className="text-sm text-text-muted">No recipients match.</p>}
            {result && result.items.length > 0 && (
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr>
                            {["Address", "Status", "Sent", "Opened", "Clicked", "Replied", "Problem"].map((heading) => (
                                <th key={heading} className="text-left text-xs uppercase tracking-wide text-text-muted py-2 px-2.5 border-b border-border">
                                    {heading}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {result.items.map((item) => (
                            <tr key={item.uid}>
                                <td className="py-2 px-2.5 border-b border-border">
                                    <a className="text-primary-dark hover:underline" href={href(`/crm/contacts/${encodeURIComponent(item.contactUid)}`)}>
                                        {item.email}
                                    </a>
                                    {campaign.abTest && item.variantId && <span className="ml-2 text-xs text-text-muted">{item.variantId}</span>}
                                </td>
                                <td className="py-2 px-2.5 border-b border-border">{item.status}</td>
                                <td className="py-2 px-2.5 border-b border-border whitespace-nowrap">{when(item.sentAt)}</td>
                                <td className="py-2 px-2.5 border-b border-border">{item.firstOpenedAt ? item.openCount : "–"}</td>
                                <td className="py-2 px-2.5 border-b border-border">{item.firstClickedAt ? item.clickCount : "–"}</td>
                                <td className="py-2 px-2.5 border-b border-border">{item.repliedAt ? "Yes" : "–"}</td>
                                <td className="py-2 px-2.5 border-b border-border text-xs">
                                    {item.bouncedAt
                                        ? `Bounced (${item.bounceType})`
                                        : item.complainedAt
                                          ? "Complained"
                                          : item.unsubscribedAt
                                            ? "Unsubscribed"
                                            : (item.error ?? "")}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {pages > 1 && (
                <div className="flex items-center gap-3 mt-2 text-sm">
                    <Button type="button" variant="secondary" className="!w-auto !py-1" disabled={page === 0} onClick={() => setPage(page - 1)}>
                        Previous
                    </Button>
                    <span>
                        Page {page + 1} of {pages}
                    </span>
                    <Button type="button" variant="secondary" className="!w-auto !py-1" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
                        Next
                    </Button>
                </div>
            )}
        </section>
    );
}
