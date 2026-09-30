// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// The public pages: preference center, confirmation, unsubscribe and signup forms.
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@rapidmx/web-client/lib/util/api.js";
import * as publicApi from "../../apps/shared/publicApi.js";
import PreferencesPage from "../../apps/subscriptions/[token].js";
import ConfirmSubscriptionPage from "../../apps/subscriptions/confirm/[token].js";
import UnsubscribeLinkPage from "../../apps/subscriptions/unsubscribe/[token].js";
import SubscriptionsIndexPage from "../../apps/subscriptions/index.js";
import FormPage from "../../apps/f/[formUid].js";
import FormsIndexPage from "../../apps/f/index.js";
import SubscriptionsLayout from "../../apps/subscriptions/_layout.js";
import FormsLayout from "../../apps/f/_layout.js";
import { emptyResponse, jsonResponse, mockFetch } from "./testUtils.js";

vi.mock("../../apps/shared/publicApi.js", async (importOriginal) => {
    const actual: any = await importOriginal();
    return Object.fromEntries(Object.entries(actual).map(([name, value]) => [name, typeof value === "function" ? vi.fn() : value]));
});
vi.mock("@rapidmx/web-client/lib/branding/useBranding.js", () => ({ default: () => ({ branding: null }), CUSTOM_STYLESHEET_LINK_ID: "custom-stylesheet" }));
vi.mock("@rapidmx/web-client/shared/components/layout/BrandingChrome.js", () => ({ BrandingHeader: () => <header />, BrandingFooter: () => <footer /> }));

const api: any = publicApi;
const notFound = new ApiRequestError("Not found", 404);
const assign = vi.fn();

beforeEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign } });
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe("preference center", () => {
    const preferences = (overrides: Record<string, unknown> = {}) => ({
        workspaceName: "Acme",
        email: "ann@x.example",
        unsubscribedAll: false,
        lists: [
            { uid: "l1", name: "News", description: "Monthly", subscribed: true },
            { uid: "l2", name: "Offers", subscribed: false },
        ],
        ...overrides,
    });

    it("shows and saves list choices, unsubscribes from all, and resubscribes", async () => {
        api.getPreferences.mockResolvedValue(preferences());
        api.savePreferences
            .mockRejectedValueOnce(new ApiRequestError("'lists' must map lists the preference center offers to true or false.", 400))
            .mockResolvedValueOnce(preferences({ lists: [{ uid: "l1", name: "News", subscribed: true }, { uid: "l2", name: "Offers", subscribed: true }] }))
            .mockResolvedValueOnce(preferences({ unsubscribedAll: true, lists: [] }))
            .mockResolvedValueOnce(preferences());
        render(<PreferencesPage params={{ token: "t" }} />);

        expect(await screen.findByText("ann@x.example")).toBeInTheDocument();
        expect(screen.getByText("Monthly")).toBeInTheDocument();
        await userEvent.click(screen.getByLabelText(/Offers/));
        await userEvent.click(screen.getByRole("button", { name: "Save preferences" }));
        expect(await screen.findByText("'lists' must map lists the preference center offers to true or false.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Save preferences" }));
        expect(await screen.findByText("Your preferences are saved.")).toBeInTheDocument();
        expect(api.savePreferences).toHaveBeenLastCalledWith("t", { lists: { l1: true, l2: true } });

        await userEvent.click(screen.getByRole("button", { name: "Unsubscribe from all email" }));
        expect(await screen.findByText("You have unsubscribed from all email.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Save preferences" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Resubscribe" }));
        expect(await screen.findByText("Welcome back.")).toBeInTheDocument();
    });

    it("explains a link that doesn't work, and a failure", async () => {
        api.getPreferences.mockRejectedValueOnce(notFound);
        const { unmount } = render(<PreferencesPage params={{ token: "t" }} />);
        expect(await screen.findByText("This link doesn't work any more. Use the link in your most recent email.")).toBeInTheDocument();
        unmount();
        api.getPreferences.mockRejectedValueOnce(new Error("x"));
        render(<PreferencesPage params={{ token: "t" }} />);
        expect(await screen.findByText("Your preferences could not be loaded.")).toBeInTheDocument();
    });

    it("says what to do when opened without a link", () => {
        render(<SubscriptionsIndexPage />);
        expect(screen.getByText("Open this page from the link in one of our emails.")).toBeInTheDocument();
    });
});

describe("confirmation and unsubscribe pages", () => {
    it("confirms a subscription on the button", async () => {
        api.confirmSubscription.mockRejectedValueOnce(notFound).mockResolvedValueOnce({ workspaceName: "Acme", lists: ["News"] });
        render(<ConfirmSubscriptionPage params={{ token: "t" }} />);
        await userEvent.click(screen.getByRole("button", { name: "Confirm subscription" }));
        expect(await screen.findByText(/doesn't work any more/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Confirm subscription" }));
        expect(await screen.findByText("Thanks! You're subscribed to News from Acme.")).toBeInTheDocument();
    });

    it("says when there was nothing left to confirm", async () => {
        api.confirmSubscription.mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce({ workspaceName: "Acme", lists: [] });
        render(<ConfirmSubscriptionPage params={{ token: "t" }} />);
        await userEvent.click(screen.getByRole("button", { name: "Confirm subscription" }));
        expect(await screen.findByText("Your subscription could not be confirmed.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Confirm subscription" }));
        expect(await screen.findByText(/nothing left to confirm/)).toBeInTheDocument();
    });

    it("unsubscribes on the button, from a list or from everything, and links to the preference center", async () => {
        api.unsubscribe
            .mockRejectedValueOnce(new Error("x"))
            .mockResolvedValueOnce({ workspaceName: "Acme", list: "News", preferencesToken: "p t" })
            .mockResolvedValueOnce({ workspaceName: "Acme", preferencesToken: "p" });
        const { unmount } = render(<UnsubscribeLinkPage params={{ token: "t" }} />);
        await userEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
        expect(await screen.findByText("You could not be unsubscribed. Please try again.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
        expect(await screen.findByText("You're unsubscribed from News.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Manage your email preferences" })).toHaveAttribute("href", "/subscriptions/p%20t");
        unmount();
        render(<UnsubscribeLinkPage params={{ token: "t" }} />);
        await userEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
        expect(await screen.findByText("You won't get any more marketing email from Acme.")).toBeInTheDocument();
    });
});

describe("signup forms", () => {
    const form = {
        uid: "f1",
        title: "Join us",
        description: "News monthly",
        fields: [
            { target: "email", label: "Email", required: true, type: "email" },
            { target: "firstName", label: "Name", required: false, type: "text" },
            { target: "properties.seats", label: "Seats", required: false, type: "number" },
            { target: "properties.since", label: "Since", required: false, type: "date" },
            { target: "properties.beta", label: "Beta", required: false, type: "boolean" },
            { target: "properties.plan", label: "Plan", required: true, type: "select", options: [{ value: "pro", label: "Pro" }] },
            { target: "properties.plan2", label: "Plan2", required: false, type: "select" },
            { target: "properties.tools", label: "Tools", required: false, type: "multi_select", options: [{ value: "mail", label: "Mail" }, { value: "crm", label: "CRM" }] },
            { target: "properties.none", label: "None", required: false, type: "multi_select" },
        ],
    };

    it("fills in and sends a form, showing its message", async () => {
        api.getPublicForm.mockResolvedValue(form);
        api.submitForm.mockRejectedValueOnce(new ApiRequestError("Email is required.", 400)).mockRejectedValueOnce(new Error("x")).mockResolvedValue({
            result: "confirm",
            message: "Check your inbox.",
            redirectUrl: "https://x.example",
        });
        render(<FormPage params={{ formUid: "f1" }} />);

        expect(await screen.findByText("News monthly")).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText("Email *"), "ann@x.example");
        await userEvent.type(screen.getByLabelText("Name"), "Ann");
        await userEvent.type(screen.getByLabelText("Seats"), "3");
        await userEvent.click(screen.getByLabelText("Beta"));
        await userEvent.selectOptions(screen.getByLabelText("Plan *"), "pro");
        await userEvent.click(screen.getByLabelText("Mail"));
        await userEvent.click(screen.getByLabelText("CRM"));
        await userEvent.click(screen.getByLabelText("Mail"));
        expect(screen.getByLabelText("Since")).toHaveAttribute("type", "date");
        await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
        expect(await screen.findByText("Email is required.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
        expect(await screen.findByText("The form could not be sent. Please try again.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
        expect(await screen.findByText("Check your inbox.")).toBeInTheDocument();
        expect(api.submitForm).toHaveBeenLastCalledWith(
            "f1",
            { email: "ann@x.example", firstName: "Ann", "properties.seats": "3", "properties.beta": true, "properties.plan": "pro", "properties.tools": ["crm"] },
            "",
        );
        expect(assign).not.toHaveBeenCalled();
    });

    it("sends what a bot typed into the trap field", async () => {
        api.getPublicForm.mockResolvedValueOnce({ ...form, fields: [form.fields[0]] });
        api.submitForm.mockResolvedValue({ result: "subscribed", message: "ok" });
        const { container } = render(<FormPage params={{ formUid: "f1" }} />);
        await userEvent.type(await screen.findByLabelText("Email *"), "a@x.example");
        await userEvent.type(container.querySelector("input[name=website]")!, "spam");
        await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
        expect(api.submitForm).toHaveBeenCalledWith("f1", { email: "a@x.example" }, "spam");
    });

    it("goes to the form's page once subscribed, and says when a form isn't there", async () => {
        api.getPublicForm.mockResolvedValueOnce({ ...form, description: undefined, fields: [form.fields[0]] });
        api.submitForm.mockResolvedValue({ result: "subscribed", message: "Thanks", redirectUrl: "https://acme.example/thanks" });
        const { unmount } = render(<FormPage params={{ formUid: "f1" }} />);
        await userEvent.type(await screen.findByLabelText("Email *"), "a@x.example");
        await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
        await waitFor(() => expect(assign).toHaveBeenCalledWith("https://acme.example/thanks"));
        unmount();

        api.getPublicForm.mockRejectedValueOnce(notFound);
        const second = render(<FormPage params={{ formUid: "f1" }} />);
        expect(await screen.findByText("This form isn't available.")).toBeInTheDocument();
        second.unmount();
        api.getPublicForm.mockRejectedValueOnce(new Error("x"));
        render(<FormPage params={{ formUid: "f1" }} />);
        expect(await screen.findByText("The form could not be loaded.")).toBeInTheDocument();
    });

    it("shows a subscribed form's message when it has no page to go to, and the index page", async () => {
        api.getPublicForm.mockResolvedValueOnce({ ...form, fields: [form.fields[0]] });
        api.submitForm.mockResolvedValue({ result: "subscribed", message: "All set" });
        render(<FormPage params={{ formUid: "f1" }} />);
        await userEvent.type(await screen.findByLabelText("Email *"), "a@x.example");
        await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
        expect(await screen.findByText("All set")).toBeInTheDocument();
        render(<FormsIndexPage />);
        expect(screen.getByText("This form isn't available.")).toBeInTheDocument();
    });

    it("titles the public pages with the deployment's branding", () => {
        expect(renderToStaticMarkup(<SubscriptionsLayout>x</SubscriptionsLayout>)).toContain("<title>RapidMX: Email preferences</title>");
        expect(renderToStaticMarkup(<FormsLayout branding={{ companyName: "Acme", stylesheetUrl: "/s.css" } as any}>x</FormsLayout>)).toContain("<title>Acme: Sign up</title>");
    });
});

describe("publicApi", () => {
    it("calls each anonymous endpoint", async () => {
        const actual: any = await vi.importActual("../../apps/shared/publicApi.js");
        const calls: string[] = [];
        mockFetch((url, init) => {
            calls.push(`${init?.method ?? "GET"} ${url}${init?.body ? ` ${init.body}` : ""}`);
            return url.includes("confirm") ? emptyResponse(204) : jsonResponse(200, {});
        });
        await actual.getPublicForm("f 1");
        await actual.submitForm("f1", { email: "a" }, "");
        await actual.confirmSubscription("t");
        await actual.getPreferences("t");
        await actual.savePreferences("t", { unsubscribeAll: true });
        await actual.unsubscribe("t");
        expect(calls).toEqual([
            "GET /api/mail/crm/public/forms/f%201",
            'POST /api/mail/crm/public/forms/f1 {"values":{"email":"a"},"website":""}',
            "POST /api/mail/crm/public/confirm/t {}",
            "GET /api/mail/crm/public/preferences/t",
            'POST /api/mail/crm/public/preferences/t {"unsubscribeAll":true}',
            "POST /api/mail/crm/public/unsubscribe/t {}",
        ]);
    });
});
