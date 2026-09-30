///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////

/** Thrown for a CSV the parser can't read. */
export class CsvError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "CsvError";
    }
}

/** What `parseCsv()` gives up at. */
export interface CsvLimits {
    maxRows?: number;
    maxColumns?: number;
    maxFieldLength?: number;
}

/**
 * Parses RFC 4180 CSV into rows of fields: fields separated by `delimiter` (a comma unless given; `detectDelimiter()` can pick one),
 * rows by CRLF or LF, a field in double quotes may hold the delimiter, line breaks and `""` for a quote. A leading UTF-8 byte order
 * mark is dropped, and so are lines that are entirely empty. Throws a `CsvError` for an unterminated quote or when `limits` are
 * exceeded.
 */
export function parseCsv(text: string, delimiter: string = ",", limits: CsvLimits = {}): string[][] {
    const maxRows: number = limits.maxRows ?? Infinity;
    const maxColumns: number = limits.maxColumns ?? 500;
    const maxFieldLength: number = limits.maxFieldLength ?? 100000;
    const input: string = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const rows: string[][] = [];
    let row: string[] = [];
    let field: string = "";
    let quoted: boolean = false;
    let fieldWasQuoted: boolean = false;
    let i: number = 0;

    const endField = (): void => {
        if (field.length > maxFieldLength) {
            throw new CsvError(`Row ${rows.length + 1} has a value longer than ${maxFieldLength} characters.`);
        }
        row.push(field);
        if (row.length > maxColumns) {
            throw new CsvError(`Row ${rows.length + 1} has more than ${maxColumns} columns.`);
        }
        field = "";
        fieldWasQuoted = false;
    };
    const endRow = (): void => {
        // A line with one quoted empty value (`""`) is a row; a line with nothing on it isn't.
        const lastWasQuoted: boolean = fieldWasQuoted;
        endField();
        if (!(row.length === 1 && row[0] === "" && !lastWasQuoted)) {
            rows.push(row);
            if (rows.length > maxRows) {
                throw new CsvError(`The file has more than ${maxRows} rows.`);
            }
        }
        row = [];
    };

    while (i < input.length) {
        const char: string = input[i];
        if (quoted) {
            if (char === '"') {
                if (input[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }
                quoted = false;
                i++;
                continue;
            }
            field += char;
            i++;
            continue;
        }
        if (char === '"' && field.length === 0) {
            quoted = true;
            fieldWasQuoted = true;
            i++;
        } else if (char === delimiter) {
            endField();
            i++;
        } else if (char === "\r" && input[i + 1] === "\n") {
            endRow();
            i += 2;
        } else if (char === "\n" || char === "\r") {
            endRow();
            i++;
        } else {
            field += char;
            i++;
        }
    }
    if (quoted) {
        throw new CsvError(`Row ${rows.length + 1} has a quoted value that never ends.`);
    }
    if (field.length > 0 || row.length > 0 || fieldWasQuoted) {
        endRow();
    }
    return rows;
}

/** The delimiter of a CSV file, from its first line: whichever of comma, semicolon or tab appears most outside quotes (comma on a tie). */
export function detectDelimiter(text: string): string {
    const firstLine: string = text.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, "");
    let best: string = ",";
    let bestCount: number = 0;
    for (const candidate of [",", ";", "\t"]) {
        const count: number = firstLine.split(candidate).length - 1;
        if (count > bestCount) {
            best = candidate;
            bestCount = count;
        }
    }
    return best;
}

/**
 * One CSV field: quoted when it holds a comma, a quote or a line break. A value starting with `=`, `+`, `-`, `@`, a tab or a carriage
 * return gets a leading `'`, so a spreadsheet opening the file reads it as text instead of running it as a formula (CSV injection).
 */
export function csvField(value: unknown): string {
    let text: string = value === undefined || value === null ? "" : value instanceof Date ? value.toISOString() : String(value);
    if (/^[=+\-@\t\r]/.test(text)) {
        text = `'${text}`;
    }
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One CSV line (CRLF-terminated) of `values`. */
export function csvLine(values: unknown[]): string {
    return `${values.map(csvField).join(",")}\r\n`;
}
