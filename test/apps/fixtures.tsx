///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Fixtures shared by the UI tests. Each test file mocks `apps/shared/crmApi.js` itself (vi.mock is hoisted per file) with
// `mockCrmApi()`, and the web client's `AppShell` with `MockAppShell`.
import React, { PropsWithChildren } from "react";
import { vi } from "vitest";

const stored = { version: 0, dateCreated: "2026-09-01T00:00:00.000Z", dateModified: "2026-09-01T00:00:00.000Z" };

export function workspace(overrides: Record<string, unknown> = {}): any {
    return { uid: "w1", name: "Acme", timezone: "UTC", createdByUserUid: "u1", role: "owner", ...stored, ...overrides };
}

export function contact(overrides: Record<string, unknown> = {}): any {
    return {
        uid: "c1",
        workspaceUid: "w1",
        email: "ann@acme.example",
        firstName: "Ann",
        lastName: "Archer",
        lifecycleStage: "lead",
        score: 10,
        tags: ["vip"],
        emailStatus: "active",
        properties: {},
        ...stored,
        ...overrides,
    };
}

export function company(overrides: Record<string, unknown> = {}): any {
    return { uid: "co1", workspaceUid: "w1", name: "Acme Inc", domain: "acme.example", tags: [], properties: {}, ...stored, ...overrides };
}

export function property(overrides: Record<string, unknown> = {}): any {
    return { uid: "p1", workspaceUid: "w1", objectType: "contact", key: "plan", label: "Plan", type: "select", options: [{ value: "pro", label: "Pro" }], ...stored, ...overrides };
}

export function member(overrides: Record<string, unknown> = {}): any {
    return { uid: "m1", workspaceUid: "w1", userUid: "u1", role: "owner", address: "owner@acme.example", displayName: "Olive Owner", ...stored, ...overrides };
}

/** A factory for `vi.mock("…/crmApi.js", …)`: the real module with every API call replaced by a `vi.fn()`. */
export async function mockCrmApi(importOriginal: () => Promise<any>): Promise<any> {
    const actual = await importOriginal();
    const mocked: Record<string, unknown> = { ...actual };
    for (const [name, value] of Object.entries(actual)) {
        if (typeof value === "function" && !["recordPath", "errorMessage"].includes(name)) {
            mocked[name] = vi.fn();
        }
    }
    return mocked;
}

/** Stands in for the web client's `AppShell`, which needs the whole webmail frame. */
export function MockAppShell({ children, active }: PropsWithChildren<{ active: string }>) {
    return (
        <div data-testid="app-shell" data-active={active}>
            {children}
        </div>
    );
}

/** The mocked API calls a CRM page makes before it shows anything: the workspace list, and the lists its page loads. */
export function stubBasics(api: any, overrides: { workspaces?: any[] } = {}): void {
    api.listWorkspaces.mockResolvedValue(overrides.workspaces ?? [workspace()]);
    api.listProperties.mockResolvedValue([]);
    api.listMembers.mockResolvedValue([member()]);
    api.searchRecords.mockResolvedValue({ items: [], total: 0 });
    api.listTasks.mockResolvedValue([]);
    api.listImports.mockResolvedValue([]);
    api.listSenders.mockResolvedValue([]);
    api.listNotes.mockResolvedValue([]);
    api.listTimeline.mockResolvedValue([]);
    api.listLists.mockResolvedValue([]);
    api.listSubscriptions.mockResolvedValue([]);
    api.listForms.mockResolvedValue([]);
    api.listSuppressions.mockResolvedValue([]);
}

export function list(overrides: Record<string, unknown> = {}): any {
    return { uid: "l1", name: "Newsletter", publicName: "News", doubleOptIn: false, visible: true, subscribedCount: 3, pendingCount: 1, ...stored, ...overrides };
}
