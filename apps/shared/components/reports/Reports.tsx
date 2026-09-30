///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import { EmailReport, GrowthReport, Pipeline, SalesReport, emailReport, errorMessage, growthReport, listPipelines, salesReport } from "../../crmApi.js";
import { INPUT_CLASS, useCrm } from "../CrmShell.js";
import { percent } from "../campaigns/campaignUi.js";
import { ColumnChart, LineChart, VIZ_STYLE } from "./Charts.js";

/** The report periods offered, in days. */
export const PERIODS: readonly number[] = [7, 30, 90, 365];

/** A headline number, with what it is of beneath. */
function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
    return (
        <div className="border border-border rounded-sm p-3">
            <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
            <div className="text-xl font-bold">{value}</div>
            {detail && <div className="text-xs text-text-muted">{detail}</div>}
        </div>
    );
}

const count = (value: number): string => value.toLocaleString();

/**
 * The workspace's reports over a period: email performance by day (sent, opened, clicked) with its rates and the recipient domains
 * mailed most; audience growth (new contacts, subscribes and unsubscribes) with each list's subscribers; and sales (deals won by
 * value, what is open, the win rate) for all pipelines or one. Days are UTC days.
 */
export default function Reports() {
    const { workspace } = useCrm();
    const [days, setDays] = useState<number>(30);
    const [pipelineUid, setPipelineUid] = useState<string>("");
    const [pipelines, setPipelines] = useState<Pipeline[]>([]);
    const [email, setEmail] = useState<EmailReport | null>(null);
    const [growth, setGrowth] = useState<GrowthReport | null>(null);
    const [sales, setSales] = useState<SalesReport | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        listPipelines(workspace.uid).then(setPipelines, () => setPipelines([]));
    }, [workspace.uid]);

    useEffect(() => {
        let current = true;
        setError(null);
        Promise.all([emailReport(workspace.uid, days), growthReport(workspace.uid, days), salesReport(workspace.uid, days, pipelineUid || undefined)]).then(
            ([nextEmail, nextGrowth, nextSales]) => {
                if (current) {
                    setEmail(nextEmail);
                    setGrowth(nextGrowth);
                    setSales(nextSales);
                }
            },
            (err) => current && setError(errorMessage(err, "Could not load the reports.")),
        );
        return () => {
            current = false;
        };
    }, [workspace.uid, days, pipelineUid]);

    const dates: string[] = email?.days.map((day) => day.date) ?? [];
    const closed: number = sales ? sales.won.count + sales.lost : 0;
    return (
        <div>
            <style>{VIZ_STYLE}</style>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <h1 className="text-xl font-bold mr-auto">Reports</h1>
                <label className="text-sm flex items-center gap-2">
                    Period
                    <select className={INPUT_CLASS} value={days} onChange={(event) => setDays(Number(event.target.value))}>
                        {PERIODS.map((period) => (
                            <option key={period} value={period}>
                                Last {period} days
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-sm flex items-center gap-2">
                    Pipeline
                    <select className={INPUT_CLASS} value={pipelineUid} onChange={(event) => setPipelineUid(event.target.value)}>
                        <option value="">All pipelines</option>
                        {pipelines.map((pipeline) => (
                            <option key={pipeline.uid} value={pipeline.uid}>
                                {pipeline.name}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            {error && <Alert>{error}</Alert>}
            {!error && !email && <p className="text-sm text-text-muted">Loading&hellip;</p>}
            {email && growth && sales && (
                <div className="flex flex-col gap-8">
                    <section aria-labelledby="crm-report-email">
                        <h2 id="crm-report-email" className="text-lg font-semibold mb-3">
                            Email
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                            <Stat label="Sent" value={count(email.totals.sent)} />
                            <Stat label="Open rate" value={percent(email.totals.opened, email.totals.sent)} detail={`${count(email.totals.opened)} opened`} />
                            <Stat label="Click rate" value={percent(email.totals.clicked, email.totals.sent)} detail={`${count(email.totals.clicked)} clicked`} />
                            <Stat label="Reply rate" value={percent(email.totals.replied, email.totals.sent)} detail={`${count(email.totals.replied)} replied`} />
                            <Stat label="Bounce rate" value={percent(email.totals.bounced, email.totals.sent)} detail={`${count(email.totals.bounced)} bounced`} />
                            <Stat label="Unsubscribe rate" value={percent(email.totals.unsubscribed, email.totals.sent)} detail={`${count(email.totals.unsubscribed)} unsubscribed`} />
                            <Stat label="Spam complaints" value={count(email.totals.complained)} />
                        </div>
                        <LineChart
                            title="Messages per day"
                            days={dates}
                            series={[
                                { key: "sent", label: "Sent", slot: 1, values: email.days.map((day) => day.sent) },
                                { key: "opened", label: "Opened", slot: 2, values: email.days.map((day) => day.opened) },
                                { key: "clicked", label: "Clicked", slot: 3, values: email.days.map((day) => day.clicked) },
                            ]}
                        />
                        <h3 className="text-sm font-semibold mt-4 mb-1">Top recipient domains</h3>
                        {email.domains.length === 0 ? (
                            <p className="text-sm text-text-muted">Nothing was sent in this period.</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-text-muted">
                                        <th className="font-normal py-1">Domain</th>
                                        <th className="font-normal py-1 text-right">Sent</th>
                                        <th className="font-normal py-1 text-right">Open rate</th>
                                        <th className="font-normal py-1 text-right">Click rate</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {email.domains.map((domain) => (
                                        <tr key={domain.domain} className="border-t border-border">
                                            <td className="py-1">{domain.domain}</td>
                                            <td className="py-1 text-right tabular-nums">{count(domain.sent)}</td>
                                            <td className="py-1 text-right tabular-nums">{percent(domain.opened, domain.sent)}</td>
                                            <td className="py-1 text-right tabular-nums">{percent(domain.clicked, domain.sent)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </section>

                    <section aria-labelledby="crm-report-growth">
                        <h2 id="crm-report-growth" className="text-lg font-semibold mb-3">
                            Audience
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                            <Stat label="Contacts" value={count(growth.contacts)} />
                            <Stat label="New contacts" value={count(growth.days.reduce((sum, day) => sum + day.contacts, 0))} />
                            <Stat label="Subscribes" value={count(growth.days.reduce((sum, day) => sum + day.subscribed, 0))} />
                            <Stat label="Unsubscribes" value={count(growth.days.reduce((sum, day) => sum + day.unsubscribed, 0))} />
                        </div>
                        <LineChart
                            title="Audience per day"
                            days={growth.days.map((day) => day.date)}
                            series={[
                                { key: "contacts", label: "New contacts", slot: 1, values: growth.days.map((day) => day.contacts) },
                                { key: "subscribed", label: "Subscribes", slot: 2, values: growth.days.map((day) => day.subscribed) },
                                { key: "unsubscribed", label: "Unsubscribes", slot: 3, values: growth.days.map((day) => day.unsubscribed) },
                            ]}
                        />
                        {growth.lists.length > 0 && (
                            <>
                                <h3 className="text-sm font-semibold mt-4 mb-1">Subscribers by list</h3>
                                <ul className="text-sm list-none m-0 p-0">
                                    {growth.lists.map((list) => (
                                        <li key={list.uid} className="flex border-t border-border py-1">
                                            <span>{list.name}</span>
                                            <span className="ml-auto tabular-nums">{count(list.subscribed)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </section>

                    <section aria-labelledby="crm-report-sales">
                        <h2 id="crm-report-sales" className="text-lg font-semibold mb-3">
                            Sales
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                            <Stat label="Open deals" value={count(sales.open.count)} detail={`${count(sales.open.amount)} in value`} />
                            <Stat label="Won" value={count(sales.won.count)} detail={`${count(sales.won.amount)} in value`} />
                            <Stat label="Lost" value={count(sales.lost)} />
                            <Stat label="Win rate" value={percent(sales.won.count, closed)} detail={`of ${count(closed)} closed`} />
                        </div>
                        <ColumnChart title="Value won per day" label="Value won" days={sales.days.map((day) => day.date)} values={sales.days.map((day) => day.wonAmount)} />
                        <p className="text-xs text-text-muted mt-2">Values add up deal amounts as they are, whatever their currency.</p>
                    </section>
                </div>
            )}
        </div>
    );
}
