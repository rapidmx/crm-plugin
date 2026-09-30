///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { badRequest } from "../util/Validation.js";

/** The contact's own date fields a date trigger can use, besides custom date properties (`properties.<key>`). */
export const DATE_TRIGGER_FIELDS: readonly string[] = ["dateCreated", "lastEngagedAt"];

/** How far before (negative) or after the date a trigger may fire, in days. */
export const MAX_DATE_OFFSET = 365;

/** How a date trigger repeats. */
export enum DateRepeat {
    /** On the date's anniversary each year (birthdays, renewals, signup anniversaries). */
    YEARLY = "yearly",
    /** On the date itself, once. */
    ONCE = "once",
}

/** A date trigger's settings, as checked. */
export interface DateTrigger {
    /** `dateCreated`, `lastEngagedAt` or `properties.<key>` of a date property. */
    field: string;
    /** Days after the date (negative: before). */
    offsetDays: number;
    repeat: DateRepeat;
    /** The hour of the day (in the workspace's time zone) from which contacts are put in. */
    hour: number;
}

/** A date trigger's settings from a trigger step's config, or a 400 naming `where`. */
export function readDateTrigger(config: Record<string, unknown>, where: string): DateTrigger {
    const field: unknown = config.dateField;
    if (typeof field !== "string" || !(DATE_TRIGGER_FIELDS.includes(field) || /^properties\.[a-z][a-z0-9_]{0,63}$/.test(field))) {
        throw badRequest(`${where}: choose the date the automation starts from.`);
    }
    const offsetDays: unknown = config.offsetDays ?? 0;
    if (typeof offsetDays !== "number" || !Number.isInteger(offsetDays) || Math.abs(offsetDays) > MAX_DATE_OFFSET) {
        throw badRequest(`${where}: 'offsetDays' must be a whole number from -${MAX_DATE_OFFSET} to ${MAX_DATE_OFFSET}.`);
    }
    const repeat: unknown = config.repeat ?? DateRepeat.YEARLY;
    if (!Object.values(DateRepeat).includes(repeat as DateRepeat)) {
        throw badRequest(`${where}: 'repeat' must be yearly or once.`);
    }
    const hour: unknown = config.hour ?? 9;
    if (typeof hour !== "number" || !Number.isInteger(hour) || hour < 0 || hour > 23) {
        throw badRequest(`${where}: 'hour' must be a whole number from 0 to 23.`);
    }
    return { field, offsetDays, repeat: repeat as DateRepeat, hour };
}

/** `now`'s calendar day (`YYYY-MM-DD`) and hour in `timeZone` (UTC if it isn't one). */
export function localTime(now: Date, timeZone: string): { date: string; hour: number } {
    let parts: Intl.DateTimeFormatPart[];
    try {
        parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
    } catch {
        return localTime(now, "UTC");
    }
    const part = (type: string): string => parts.find((entry) => entry.type === type)!.value;
    return { date: `${part("year")}-${part("month")}-${part("day")}`, hour: Number(part("hour")) };
}

/** The day `days` after (before, if negative) `date`, both `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whether `year` has a 29 February. */
function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Whether the day `target` is an anniversary of `date` (both `YYYY-MM-DD`): the same month and day in a later year. A 29 February
 * comes round on 28 February in other years.
 */
export function isAnniversary(date: string, target: string): boolean {
    if (target.slice(0, 4) <= date.slice(0, 4)) {
        return false;
    }
    const monthDay: string = date.slice(5);
    if (monthDay === "02-29" && !isLeapYear(Number(target.slice(0, 4)))) {
        return target.slice(5) === "02-28";
    }
    return target.slice(5) === monthDay;
}

/**
 * The calendar day of a date value: a custom date property holds a day (kept as UTC midnight), so its UTC day; the contact's own
 * fields are moments, so their day in the workspace's time zone.
 */
export function dayOf(value: Date | string, field: string, timeZone: string): string {
    const moment: Date = new Date(value);
    return field.startsWith("properties.") ? moment.toISOString().slice(0, 10) : localTime(moment, timeZone).date;
}

/** Whether a date value `day` (`YYYY-MM-DD`) makes a trigger fire on `today`. */
export function dateFires(trigger: Pick<DateTrigger, "offsetDays" | "repeat">, day: string, today: string): boolean {
    const target: string = addDays(today, -trigger.offsetDays);
    return trigger.repeat === DateRepeat.ONCE ? day === target : isAnniversary(day, target);
}
