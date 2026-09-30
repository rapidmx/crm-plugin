///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { CsvError, csvField, csvLine, detectDelimiter, parseCsv } from "../../src/util/Csv.js";
import { IMPORT_FIELDS, importTargets, rowToBody, suggestMapping, validateMapping } from "../../src/util/ImportMapping.js";
import { filterValues, propertiesView, readProperties, storedValues } from "../../src/util/PropertyValues.js";
import {
    isEmail,
    normalizeDomain,
    normalizeTag,
    parseDate,
    readBoolean,
    readDate,
    readEnum,
    readNumber,
    readPaging,
    readTags,
    readText,
    requireObject,
} from "../../src/util/Validation.js";
import { ROLE_ACTIONS, assertWorkspaceAccess, isWorkspaceRole, memberRecord } from "../../src/util/WorkspaceAccess.js";
import { CrmObjectType, PropertyType, WorkspaceAction, WorkspaceRole } from "../../src/models/types.js";

describe("Csv", () => {
    it("parses quoted fields with delimiters, quotes and line breaks, CRLF and LF, and drops a BOM and empty lines", () => {
        expect(parseCsv('﻿a,"b,c","say ""hi"""\r\n\r\n1,"two\nlines",3\n4,,\n""\n')).toEqual([
            ["a", "b,c", 'say "hi"'],
            ["1", "two\nlines", "3"],
            ["4", "", ""],
            [""],
        ]);
        expect(parseCsv("a;b\r1;2", ";")).toEqual([
            ["a", "b"],
            ["1", "2"],
        ]);
        expect(parseCsv('a,"b"')).toEqual([["a", "b"]]);
        expect(parseCsv("")).toEqual([]);
    });

    it("keeps a quote inside an unquoted field as it is", () => {
        expect(parseCsv('ab"c,d')).toEqual([['ab"c', "d"]]);
    });

    it("refuses an unterminated quote and files over its limits", () => {
        expect(() => parseCsv('"never ends')).toThrow(CsvError);
        expect(() => parseCsv("a\nb\nc", ",", { maxRows: 2 })).toThrow("more than 2 rows");
        expect(() => parseCsv("a,b,c", ",", { maxColumns: 2 })).toThrow("more than 2 columns");
        expect(() => parseCsv("abcdef", ",", { maxFieldLength: 3 })).toThrow("longer than 3");
    });

    it("detects the delimiter from the first line, ignoring quoted text", () => {
        expect(detectDelimiter("a;b;c\n1,2")).toBe(";");
        expect(detectDelimiter("a\tb\n")).toBe("\t");
        expect(detectDelimiter('"x;y;z",b\n')).toBe(",");
        expect(detectDelimiter("single")).toBe(",");
    });

    it("writes fields quoted when needed and defuses formulas", () => {
        expect(csvLine(["a", 'b"c', "d,e", "f\ng", undefined, null, 5, new Date("2026-01-01T00:00:00Z")])).toBe(
            'a,"b""c","d,e","f\ng",,,5,2026-01-01T00:00:00.000Z\r\n',
        );
        expect(["=1+1", "+x", "-2", "@a", "\tz"].map(csvField)).toEqual(["'=1+1", "'+x", "'-2", "'@a", "'\tz"]);
    });
});

describe("ImportMapping", () => {
    const definitions: any[] = [
        { objectType: "contact", key: "seats", label: "Number of seats", type: PropertyType.NUMBER, options: [] },
        { objectType: "contact", key: "beta", label: "Beta", type: PropertyType.BOOLEAN, options: [] },
        { objectType: "contact", key: "since", label: "Since", type: PropertyType.DATE, options: [] },
        { objectType: "contact", key: "interests", label: "Interests", type: PropertyType.MULTI_SELECT, options: [] },
        { objectType: "contact", key: "note", label: "Note", type: PropertyType.TEXT, options: [] },
        { objectType: "company", key: "tier", label: "Tier", type: PropertyType.NUMBER, options: [] },
    ];
    const contactFields = IMPORT_FIELDS[CrmObjectType.CONTACT];

    it("lists the targets of each object type", () => {
        expect(importTargets(CrmObjectType.CONTACT, contactFields, definitions)).toEqual(expect.arrayContaining(["email", "tags", "company", "properties.note"]));
        expect(importTargets(CrmObjectType.COMPANY, IMPORT_FIELDS[CrmObjectType.COMPANY], definitions)).toEqual(
            expect.arrayContaining(["name", "tags", "properties.tier"]),
        );
        expect(importTargets(CrmObjectType.COMPANY, IMPORT_FIELDS[CrmObjectType.COMPANY], definitions)).not.toContain("company");
    });

    it("suggests each target once, by name, alias or property label", () => {
        const targets: string[] = importTargets(CrmObjectType.CONTACT, contactFields, definitions);
        expect(suggestMapping(["Email Address", "email", "Number of Seats", "Tag", "Whatever"], targets, definitions)).toEqual([
            { column: "Email Address", target: "email" },
            { column: "email", target: undefined },
            { column: "Number of Seats", target: "properties.seats" },
            { column: "Tag", target: "tags" },
            { column: "Whatever", target: undefined },
        ]);
    });

    it("validates a mapping, allowing several tag columns", () => {
        expect(
            validateMapping(
                [
                    { column: "a", target: "email" },
                    { column: "b", target: "tags" },
                    { column: "c", target: "tags" },
                    null,
                ].slice(0, 3),
                ["a", "b", "c", "d"],
                ["email", "tags"],
                "email",
            ),
        ).toEqual([
            { column: "a", target: "email" },
            { column: "b", target: "tags" },
            { column: "c", target: "tags" },
            { column: "d" },
        ]);
        expect(() => validateMapping([null], ["a"], ["email"], "email")).toThrow("doesn't have");
    });

    it("reads a row's cells as their targets' types", () => {
        const mapping = [
            { column: "Email", target: "email" },
            { column: "Score", target: "score" },
            { column: "Seats", target: "properties.seats" },
            { column: "Beta", target: "properties.beta" },
            { column: "Since", target: "properties.since" },
            { column: "Interests", target: "properties.interests" },
            { column: "Note", target: "properties.note" },
            { column: "Tags", target: "tags" },
            { column: "Skip" },
        ];
        expect(rowToBody(["a@x.example", "1,234.6", "3", "No", "2026-01-02", "mail; crm", "hello", "A;b;;A", "x"], mapping, contactFields, definitions, ["imported"])).toEqual({
            email: "a@x.example",
            score: 1235,
            properties: { seats: 3, beta: false, since: "2026-01-02T00:00:00.000Z", interests: ["mail", "crm"], note: "hello" },
            tags: ["imported", "a", "b"],
        });
        expect(rowToBody(["a@x.example"], mapping, contactFields, definitions, [])).toEqual({ email: "a@x.example" });
        expect(() => rowToBody(["a", "lots"], mapping, contactFields, definitions, [])).toThrow("'Score' must be a number");
        expect(() => rowToBody(["a", "", "x"], mapping, contactFields, definitions, [])).toThrow("'Seats' must be a number");
        expect(() => rowToBody(["a", "", "", "", "never"], mapping, contactFields, definitions, [])).toThrow("'Since' must be a date");
    });
});

describe("PropertyValues", () => {
    const text: any = { key: "note", type: PropertyType.TEXT, options: [], objectType: "contact" };

    it("stores and shows each type", () => {
        expect(storedValues(text, " hi ")).toEqual([{ stringValue: "hi" }]);
        expect(() => storedValues(text, "x".repeat(20001))).toThrow("at most");
        expect(readProperties(undefined, [], CrmObjectType.CONTACT).size).toBe(0);
        expect(readProperties({ note: "" }, [text], CrmObjectType.CONTACT).get("note")).toEqual([]);
        expect(() => readProperties(Object.fromEntries(Array.from({ length: 201 }, (_v, i) => [`k${i}`, 1])), [], CrmObjectType.CONTACT)).toThrow("At most 200");
        expect(propertiesView({ note: [], gone: [{ stringValue: "x" } as any] }, [text])).toEqual({});
        expect(filterValues({ a: [{ stringValue: "x" }, { numberValue: 2 }, { numberValue: null, dateValue: new Date(0) }] as any })).toEqual({ a: ["x", 2, new Date(0)] });
        expect(filterValues(undefined)).toEqual({});
    });
});

describe("Validation", () => {
    it("reads text, emails, enums, numbers, booleans, dates and tags", () => {
        expect(readText({ a: " x " }, "a")).toBe("x");
        expect(readText({ a: null }, "a")).toBeNull();
        expect(() => readText({}, "a", { required: true })).toThrow("required");
        expect(() => readText({ a: "" }, "a", { required: true })).toThrow("required");
        expect(readEnum({}, "a", ["x"])).toBeUndefined();
        expect(readEnum({ a: null }, "a", ["x"])).toBeNull();
        expect(() => readEnum({}, "a", ["x"], { required: true })).toThrow("required");
        expect(readNumber({ a: 5 }, "a", { min: 1 })).toBe(5);
        expect(() => readNumber({ a: 0 }, "a", { min: 1 })).toThrow("between 1 and infinity");
        expect(() => readNumber({ a: 5 }, "a", { max: 1 })).toThrow("between -infinity and 1");
        expect(readBoolean({}, "a")).toBeUndefined();
        expect(() => readBoolean({ a: 1 }, "a")).toThrow("true or false");
        expect(readDate({ a: "" }, "a")).toBeNull();
        expect(readDate({ a: null }, "a")).toBeNull();
        expect(readDate({ a: "2026-01-01" }, "a")).toEqual(new Date("2026-01-01"));
        expect(parseDate(new Date(0))).toEqual(new Date(0));
        expect(parseDate(5)).toBeUndefined();
        expect(parseDate("x".repeat(65))).toBeUndefined();
        expect(readTags({ tags: null })).toEqual([]);
        expect(() => readTags({ tags: Array.from({ length: 51 }, (_v, i) => `t${i}`) })).toThrow("at most 50");
        expect(normalizeTag(5)).toBeUndefined();
        expect(normalizeTag("x".repeat(65))).toBeUndefined();
        expect(isEmail("a@b.example")).toBe(true);
        expect(isEmail("a@b")).toBe(false);
        expect(() => requireObject(null)).toThrow("JSON object");
    });

    it("reads paging and normalizes domains", () => {
        expect(readPaging(undefined, undefined)).toEqual({ limit: 50, page: 0 });
        expect(readPaging("", "")).toEqual({ limit: 50, page: 0 });
        expect(() => readPaging("201", "0")).toThrow("1 to 200");
        expect(() => readPaging("5", "x")).toThrow("'page'");
        expect(normalizeDomain("HTTPS://www.Example.com:8080/path?q#f")).toBe("example.com");
        expect(normalizeDomain("jane@Sub.Example.org.")).toBe("sub.example.org");
        expect(normalizeDomain("localhost")).toBeUndefined();
    });
});

describe("WorkspaceAccess", () => {
    it("maps roles to ACL records", () => {
        expect(isWorkspaceRole("admin")).toBe(true);
        expect(isWorkspaceRole("boss")).toBe(false);
        expect(isWorkspaceRole(5)).toBe(false);
        expect(memberRecord("u", WorkspaceRole.EDITOR)).toEqual({ userOrRoleId: "u", actions: ["READ", "WRITE"] });
        expect(ROLE_ACTIONS[WorkspaceRole.OWNER]).toEqual(["*"]);
    });

    it("answers 404 for no caller or a malformed workspace uid, without asking the ACL", async () => {
        const aclUtils: any = { hasPermission: vi.fn() };
        for (const [user, uid] of [
            [undefined, "w"],
            [{ uid: "u" }, ""],
            [{ uid: "u" }, "x".repeat(65)],
            [{ uid: "u" }, 5],
        ] as const) {
            await expect(assertWorkspaceAccess(aclUtils, ["admin"], user as any, uid as any, WorkspaceAction.READ)).rejects.toMatchObject({ status: 404 });
        }
        expect(aclUtils.hasPermission).not.toHaveBeenCalled();
    });
});
