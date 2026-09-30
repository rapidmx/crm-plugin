///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { DateRepeat, addDays, dateFires, dayOf, isAnniversary, localTime, readDateTrigger } from "../../src/automation/Dates.js";
import { triggerMatches } from "../../src/automation/Engine.js";

describe("date triggers", () => {
    it("reads a trigger's date settings, with defaults", () => {
        expect(readDateTrigger({ dateField: "properties.birthday" }, "t")).toEqual({ field: "properties.birthday", offsetDays: 0, repeat: "yearly", hour: 9 });
        expect(readDateTrigger({ dateField: "lastEngagedAt", offsetDays: -30, repeat: "once", hour: 0 }, "t")).toEqual({ field: "lastEngagedAt", offsetDays: -30, repeat: "once", hour: 0 });
        for (const [config, message] of [
            [{}, /choose the date/],
            [{ dateField: "email" }, /choose the date/],
            [{ dateField: "properties.Bad-Key" }, /choose the date/],
            [{ dateField: "dateCreated", offsetDays: 366 }, /offsetDays/],
            [{ dateField: "dateCreated", offsetDays: 1.5 }, /offsetDays/],
            [{ dateField: "dateCreated", offsetDays: "1" }, /offsetDays/],
            [{ dateField: "dateCreated", repeat: "monthly" }, /repeat/],
            [{ dateField: "dateCreated", hour: 24 }, /hour/],
            [{ dateField: "dateCreated", hour: -1 }, /hour/],
            [{ dateField: "dateCreated", hour: "9" }, /hour/],
        ] as const) {
            expect(() => readDateTrigger(config as any, "Step t")).toThrow(message);
        }
    });

    it("tells the day and hour in a time zone, falling back to UTC", () => {
        const moment = new Date("2026-10-01T03:30:00Z");
        expect(localTime(moment, "UTC")).toEqual({ date: "2026-10-01", hour: 3 });
        expect(localTime(moment, "America/Los_Angeles")).toEqual({ date: "2026-09-30", hour: 20 });
        expect(localTime(moment, "Asia/Tokyo")).toEqual({ date: "2026-10-01", hour: 12 });
        expect(localTime(new Date("2026-10-01T00:00:00Z"), "UTC").hour).toBe(0);
        expect(localTime(moment, "Not/AZone")).toEqual({ date: "2026-10-01", hour: 3 });
    });

    it("counts days across months and years", () => {
        expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
        expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
        expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    });

    it("finds anniversaries in later years, with 29 February on the 28th in other years", () => {
        expect(isAnniversary("1990-10-01", "2026-10-01")).toBe(true);
        expect(isAnniversary("1990-10-01", "2026-10-02")).toBe(false);
        expect(isAnniversary("2026-10-01", "2026-10-01")).toBe(false);
        expect(isAnniversary("2027-10-01", "2026-10-01")).toBe(false);
        expect(isAnniversary("2000-02-29", "2027-02-28")).toBe(true);
        expect(isAnniversary("2000-02-29", "2028-02-28")).toBe(false);
        expect(isAnniversary("2000-02-29", "2028-02-29")).toBe(true);
        expect(isAnniversary("2000-02-29", "2100-02-28")).toBe(true);
        expect(isAnniversary("1999-02-28", "2028-02-28")).toBe(true);
    });

    it("reads a custom date as its UTC day and a contact's own date in the workspace's zone", () => {
        expect(dayOf(new Date("2026-09-02T03:00:00Z"), "properties.birthday", "America/Los_Angeles")).toBe("2026-09-02");
        expect(dayOf("2026-09-02T03:00:00Z", "lastEngagedAt", "America/Los_Angeles")).toBe("2026-09-01");
    });

    it("fires on the date, before or after it, once or every year", () => {
        expect(dateFires({ offsetDays: 0, repeat: DateRepeat.YEARLY }, "1990-10-01", "2026-10-01")).toBe(true);
        expect(dateFires({ offsetDays: -7, repeat: DateRepeat.YEARLY }, "1990-10-08", "2026-10-01")).toBe(true);
        expect(dateFires({ offsetDays: 30, repeat: DateRepeat.ONCE }, "2026-09-01", "2026-10-01")).toBe(true);
        expect(dateFires({ offsetDays: 30, repeat: DateRepeat.ONCE }, "2025-09-01", "2026-10-01")).toBe(false);
        expect(dateFires({ offsetDays: 0, repeat: DateRepeat.ONCE }, "2026-10-01", "2026-10-01")).toBe(true);
    });

    it("never starts a date trigger from an event", () => {
        expect(triggerMatches({ id: "t", type: "trigger" as any, config: { event: "date.reached" } }, { type: "date.reached" as any, data: {} })).toBe(false);
    });
});
