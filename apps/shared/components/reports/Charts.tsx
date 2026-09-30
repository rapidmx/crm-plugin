///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { KeyboardEvent, MouseEvent, useState } from "react";

/**
 * The chart colors, by role. The three series slots are a validated categorical order (checked for color-vision deficiency
 * separation in both schemes); the dark steps are their own, not a flip. `<html data-theme>` wins over the system's scheme.
 */
export const VIZ_STYLE = `
.crm-viz {
  --viz-series-1: #2a78d6; --viz-series-2: #eb6834; --viz-series-3: #1baf7a;
  --viz-grid: #e1e0d9; --viz-axis: #c3c2b7; --viz-muted: #898781; --viz-surface: #fcfcfb;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) .crm-viz {
    --viz-series-1: #3987e5; --viz-series-2: #d95926; --viz-series-3: #199e70;
    --viz-grid: #2c2c2a; --viz-axis: #383835; --viz-surface: #1a1a19;
  }
}
:root[data-theme="dark"] .crm-viz {
  --viz-series-1: #3987e5; --viz-series-2: #d95926; --viz-series-3: #199e70;
  --viz-grid: #2c2c2a; --viz-axis: #383835; --viz-surface: #1a1a19;
}
`;

const WIDTH = 640;
const HEIGHT = 200;
const PAD = { top: 12, right: 96, bottom: 24, left: 44 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

/** One line of a chart, in a fixed slot (1-3) so its color follows it whatever else is shown. */
export interface Series {
    key: string;
    label: string;
    slot: 1 | 2 | 3;
    values: number[];
}

/** The smallest of 1, 2, 5 × 10ⁿ at or above `value` (1 for nothing), so the axis reads in round numbers. */
export function niceMax(value: number): number {
    if (value <= 0) {
        return 1;
    }
    const magnitude: number = 10 ** Math.floor(Math.log10(value));
    const step: number = [1, 2, 5, 10].find((candidate) => candidate * magnitude >= value)!;
    return step * magnitude;
}

/** `YYYY-MM-DD` as a short day ("Mar 4"), in UTC like the reports. */
export function shortDate(date: string): string {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

const x = (index: number, count: number): number => PAD.left + (count <= 1 ? PLOT_W / 2 : (index / (count - 1)) * PLOT_W);
const y = (value: number, max: number): number => PAD.top + PLOT_H - (value / max) * PLOT_H;

/** The day under the pointer, from its position across the plot. */
function indexAt(event: MouseEvent<SVGElement>, count: number): number {
    const box: DOMRect = event.currentTarget.getBoundingClientRect();
    const plotX: number = box.width > 0 ? ((event.clientX - box.left) / box.width) * WIDTH : PAD.left;
    const ratio: number = (plotX - PAD.left) / PLOT_W;
    return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
}

/** Gridlines and the value axis: four steps up to `max`. */
function Grid({ max, format }: { max: number; format: (value: number) => string }) {
    return (
        <g>
            {[0, 1, 2, 3, 4].map((step) => {
                const value: number = (max / 4) * step;
                return (
                    <g key={step}>
                        <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={y(value, max)} y2={y(value, max)} stroke={step === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
                        <text x={PAD.left - 6} y={y(value, max)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--viz-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {format(value)}
                        </text>
                    </g>
                );
            })}
        </g>
    );
}

/** The first, middle and last days under the plot. */
function DayAxis({ days }: { days: string[] }) {
    const shown: number[] = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])];
    return (
        <g>
            {shown.map((index) => (
                <text key={index} x={x(index, days.length)} y={HEIGHT - 6} textAnchor={index === 0 ? "start" : index === days.length - 1 ? "end" : "middle"} fontSize={10} fill="var(--viz-muted)">
                    {shortDate(days[index])}
                </text>
            ))}
        </g>
    );
}

/** A table of the same numbers, for reading exact values and for assistive technology. */
function DataTable({ days, columns, format }: { days: string[]; columns: { label: string; values: number[] }[]; format: (value: number) => string }) {
    return (
        <div className="max-h-64 overflow-y-auto mt-2">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-text-muted">
                        <th className="font-normal py-1">Day</th>
                        {columns.map((column) => (
                            <th key={column.label} className="font-normal py-1 text-right">
                                {column.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {days.map((day, index) => (
                        <tr key={day} className="border-t border-border">
                            <td className="py-1">{shortDate(day)}</td>
                            {columns.map((column) => (
                                <td key={column.label} className="py-1 text-right tabular-nums">
                                    {format(column.values[index])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** A chart's frame: its title, legend, the chart or its table, and the switch between them. */
function ChartFrame({
    title,
    legend,
    table,
    children,
}: React.PropsWithChildren<{ title: string; legend?: Series[]; table: React.ReactNode }>) {
    const [showTable, setShowTable] = useState<boolean>(false);
    return (
        <figure className="crm-viz border border-border rounded-sm p-3 m-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
                <figcaption className="text-sm font-semibold">{title}</figcaption>
                {legend && (
                    <ul className="flex gap-3 text-xs text-text-muted list-none m-0 p-0" aria-label="Legend">
                        {legend.map((series) => (
                            <li key={series.key} className="flex items-center gap-1">
                                <span aria-hidden className="inline-block w-3 h-0.5 rounded-full" style={{ background: `var(--viz-series-${series.slot})` }} />
                                {series.label}
                            </li>
                        ))}
                    </ul>
                )}
                <button type="button" className="ml-auto text-xs text-primary hover:underline" aria-pressed={showTable} onClick={() => setShowTable(!showTable)}>
                    {showTable ? "Show chart" : "Show table"}
                </button>
            </div>
            {showTable ? table : children}
        </figure>
    );
}

/** The hover card: the day and each value, in text ink beside a colored key. */
function Tooltip({ index, count, day, rows }: { index: number; count: number; day: string; rows: { label: string; value: string; slot: number }[] }) {
    const left: number = (x(index, count) / WIDTH) * 100;
    return (
        <div
            role="status"
            className="absolute top-0 pointer-events-none bg-surface border border-border rounded-sm shadow-sm px-2 py-1 text-xs whitespace-nowrap"
            style={left > 60 ? { right: `${100 - left + 2}%` } : { left: `${left + 2}%` }}
        >
            <div className="font-semibold">{shortDate(day)}</div>
            {rows.map((row) => (
                <div key={row.label} className="flex items-center gap-1">
                    <span aria-hidden className="inline-block w-2 h-2 rounded-full" style={{ background: `var(--viz-series-${row.slot})` }} />
                    <span className="text-text-muted">{row.label}</span>
                    <span className="ml-auto pl-2 tabular-nums">{row.value}</span>
                </div>
            ))}
        </div>
    );
}

/** Moves the highlighted day with the arrow keys, Home and End. */
function useDayCursor(count: number): [number | null, (index: number | null) => void, (event: KeyboardEvent) => void] {
    const [active, setActive] = useState<number | null>(null);
    const onKeyDown = (event: KeyboardEvent) => {
        const moves: Record<string, number> = { ArrowLeft: (active ?? count) - 1, ArrowRight: (active ?? -1) + 1, Home: 0, End: count - 1 };
        if (event.key in moves) {
            event.preventDefault();
            setActive(Math.min(count - 1, Math.max(0, moves[event.key])));
        } else if (event.key === "Escape") {
            setActive(null);
        }
    };
    return [active, setActive, onKeyDown];
}

/** Lines over days, labelled at their ends, with a crosshair and a card of every value on hover. */
export function LineChart({ title, days, series, format = (value) => value.toLocaleString() }: { title: string; days: string[]; series: Series[]; format?: (value: number) => string }) {
    const [active, setActive, onKeyDown] = useDayCursor(days.length);
    const max: number = niceMax(Math.max(0, ...series.flatMap((entry) => entry.values)));
    const last: number = days.length - 1;
    // End labels, pushed apart so they never overlap.
    const labels = series.map((entry) => ({ entry, at: y(entry.values[last], max) })).sort((a, b) => a.at - b.at);
    for (let index = 1; index < labels.length; index++) {
        labels[index].at = Math.max(labels[index].at, labels[index - 1].at + 12);
    }
    return (
        <ChartFrame
            title={title}
            legend={series}
            table={<DataTable days={days} columns={series.map(({ label, values }) => ({ label, values }))} format={format} />}
        >
            <div className="relative">
                <svg
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    className="w-full h-auto block outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    role="img"
                    aria-label={`${title}, ${shortDate(days[0])} to ${shortDate(days[last])}`}
                    tabIndex={0}
                    onKeyDown={onKeyDown}
                    onMouseMove={(event) => setActive(indexAt(event, days.length))}
                    onMouseLeave={() => setActive(null)}
                    onBlur={() => setActive(null)}
                >
                    <Grid max={max} format={format} />
                    <DayAxis days={days} />
                    {active !== null && <line x1={x(active, days.length)} x2={x(active, days.length)} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="var(--viz-axis)" strokeWidth={1} />}
                    {series.map((entry) => (
                        <path
                            key={entry.key}
                            d={entry.values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index, days.length).toFixed(1)},${y(value, max).toFixed(1)}`).join("")}
                            fill="none"
                            stroke={`var(--viz-series-${entry.slot})`}
                            strokeWidth={2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                    ))}
                    {active !== null &&
                        series.map((entry) => (
                            <circle key={entry.key} cx={x(active, days.length)} cy={y(entry.values[active], max)} r={4} fill={`var(--viz-series-${entry.slot})`} stroke="var(--viz-surface)" strokeWidth={2} />
                        ))}
                    {labels.map(({ entry, at }) => (
                        <text key={entry.key} x={PAD.left + PLOT_W + 6} y={at} dy="0.32em" fontSize={11} fill="currentColor">
                            {entry.label}
                        </text>
                    ))}
                </svg>
                {active !== null && (
                    <Tooltip
                        index={active}
                        count={days.length}
                        day={days[active]}
                        rows={series.map((entry) => ({ label: entry.label, value: format(entry.values[active]), slot: entry.slot }))}
                    />
                )}
            </div>
        </ChartFrame>
    );
}

/** One measure per day as columns (rounded at the top, gapped), with a card of the value on hover. */
export function ColumnChart({ title, label, days, values, format = (value) => value.toLocaleString() }: { title: string; label: string; days: string[]; values: number[]; format?: (value: number) => string }) {
    const [active, setActive, onKeyDown] = useDayCursor(days.length);
    const max: number = niceMax(Math.max(0, ...values));
    const slotWidth: number = PLOT_W / days.length;
    const barWidth: number = Math.max(1, slotWidth - 2);
    const baseline: number = PAD.top + PLOT_H;
    return (
        <ChartFrame title={title} table={<DataTable days={days} columns={[{ label, values }]} format={format} />}>
            <div className="relative">
                <svg
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    className="w-full h-auto block outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    role="img"
                    aria-label={`${title}, ${shortDate(days[0])} to ${shortDate(days[days.length - 1])}`}
                    tabIndex={0}
                    onKeyDown={onKeyDown}
                    onMouseLeave={() => setActive(null)}
                    onBlur={() => setActive(null)}
                >
                    <Grid max={max} format={format} />
                    {values.map((value, index) => {
                        const left: number = PAD.left + index * slotWidth + 1;
                        const height: number = (value / max) * PLOT_H;
                        const radius: number = Math.min(4, barWidth / 2, height);
                        return (
                            <g key={days[index]} onMouseEnter={() => setActive(index)}>
                                {/* The hit target is the whole day's slot, taller and wider than the column. */}
                                <rect x={left - 1} y={PAD.top} width={slotWidth} height={PLOT_H} fill="transparent" />
                                {height > 0 && (
                                    <path
                                        d={`M${left},${baseline}V${baseline - height + radius}q0,-${radius} ${radius},-${radius}h${barWidth - 2 * radius}q${radius},0 ${radius},${radius}V${baseline}Z`}
                                        fill="var(--viz-series-1)"
                                        opacity={active === null || active === index ? 1 : 0.55}
                                    />
                                )}
                            </g>
                        );
                    })}
                    <text x={PAD.left} y={HEIGHT - 6} fontSize={10} fill="var(--viz-muted)">
                        {shortDate(days[0])}
                    </text>
                    <text x={PAD.left + PLOT_W} y={HEIGHT - 6} textAnchor="end" fontSize={10} fill="var(--viz-muted)">
                        {shortDate(days[days.length - 1])}
                    </text>
                </svg>
                {active !== null && <Tooltip index={active} count={days.length} day={days[active]} rows={[{ label, value: format(values[active]), slot: 1 }]} />}
            </div>
        </ChartFrame>
    );
}
