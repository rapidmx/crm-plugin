// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// The automations list and editor: the flow, every step's settings, publishing, settings and the contacts in it.
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@rapidmx/web-client/lib/util/api.js";
import { MockAppShell, automation, emailTemplate, list, member, mockCrmApi, segment, stubBasics, workspace } from "../../fixtures.js";
import * as crmApi from "../../../../apps/shared/crmApi.js";
import CrmShell from "../../../../apps/shared/components/CrmShell.js";
import AutomationList from "../../../../apps/shared/components/automations/AutomationList.js";
import AutomationEditor, { describeStep } from "../../../../apps/shared/components/automations/AutomationEditor.js";
import CrmAutomationsPage from "../../../../apps/crm/automations/index.js";
import CrmAutomationPage from "../../../../apps/crm/automations/[uid].js";

vi.mock("../../../../apps/shared/crmApi.js", (importOriginal) => mockCrmApi(importOriginal));
vi.mock("@rapidmx/web-client/shared/components/layout/AppShell.js", () => ({ default: MockAppShell }));

const api: any = crmApi;
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const sender = { uid: "s1", fromName: "Acme", fromAddress: "news@acme.example" };
const noSender = { uid: "s2", fromName: "", fromAddress: "hi@acme.example" };
const form = { uid: "f1", name: "Signup" };

/** A graph with a step of every kind. */
function everyStep(): any {
    const ids = ["delay", "wait", "cond", "split", "send", "field", "tag", "untag", "sub", "unsub", "task", "notify", "enroll", "end"];
    const types = ["delay", "wait", "condition", "split", "send_email", "set_field", "add_tag", "remove_tag", "subscribe", "unsubscribe", "create_task", "notify", "enroll", "exit"];
    const nodes: any[] = [{ id: "trigger", type: "trigger", config: { event: "list.subscribed" } }];
    ids.forEach((id, index) => nodes.push({ id, type: types[index], config: types[index] === "delay" ? { amount: 1, unit: "days" } : {} }));
    const edges: any[] = [];
    const order = ["trigger", "send", "delay", "wait", "cond", "split", "field", "tag", "untag", "sub", "unsub", "task", "notify", "enroll", "end"];
    const ports: Record<string, string> = { wait: "matched", cond: "yes", split: "a" };
    for (let index = 0; index < order.length - 1; index++) {
        edges.push({ from: order[index], to: order[index + 1], port: ports[order[index]] ?? "next" });
    }
    return { nodes, edges };
}

function inShell(ui: React.ReactElement, role: string = "owner") {
    api.listWorkspaces.mockResolvedValue([workspace({ role })]);
    return render(<CrmShell section="automations">{ui}</CrmShell>);
}

async function renderEditor(value: any = automation(), role: string = "owner") {
    api.getAutomation.mockResolvedValue(value);
    inShell(<AutomationEditor uid="a1" />, role);
    await screen.findByLabelText("Automation name");
}

const settings = () => within(screen.getByRole("complementary", { name: "Step settings" }));
const select = async (name: string) => await userEvent.click(button(`Step ${name}`));

beforeEach(() => {
    stubBasics(api);
    api.listLists.mockResolvedValue([list()]);
    api.listForms.mockResolvedValue([form]);
    api.listSegments.mockResolvedValue([segment()]);
    api.searchTemplates.mockResolvedValue({ items: [emailTemplate()], total: 1 });
    api.listSenders.mockResolvedValue([sender, noSender]);
    api.listMembers.mockResolvedValue([member(), member({ uid: "m2", userUid: "u2", displayName: "", address: "" })]);
    api.listAutomations.mockResolvedValue([automation(), automation({ uid: "a2", name: "Nurture" })]);
    window.localStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, search: "", pathname: "/crm/automations", assign: vi.fn() } });
});

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe("AutomationList", () => {
    it("lists, creates from a recipe and deletes automations", async () => {
        api.listAutomations.mockResolvedValue([automation({ description: "Hello", status: "active", publishedAt: "2026-09-30T10:00:00.000Z" }), automation({ uid: "a2", name: "Nurture" })]);
        api.createAutomation.mockRejectedValueOnce(new ApiRequestError("Too many.", 400)).mockResolvedValue(automation({ uid: "new" }));
        api.deleteAutomation.mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
        vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
        inShell(<AutomationList />);
        expect(await screen.findByText("Hello")).toBeInTheDocument();
        expect(screen.getByText("Active")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Nurture" })).toHaveAttribute("href", "/crm/automations/a2?w=w1");

        await userEvent.click(button("+ New automation"));
        await userEvent.type(screen.getByLabelText("Name"), "Onboarding");
        await userEvent.click(screen.getByLabelText(/Welcome series/));
        await userEvent.click(button("Create"));
        expect(await screen.findByText("Too many.")).toBeInTheDocument();
        await userEvent.click(button("Create"));
        await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("/crm/automations/new?w=w1"));
        expect(api.createAutomation.mock.lastCall[1].graph.nodes).toHaveLength(6);
        await userEvent.click(button("Close"));

        await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
        await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
        expect(await screen.findByText("Could not delete the automation.")).toBeInTheDocument();
        await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
        await waitFor(() => expect(api.listAutomations).toHaveBeenCalledTimes(2));
    });

    it("shows viewers the list only, says when loading fails, and is a page with an editor page", async () => {
        api.listAutomations.mockRejectedValueOnce(new Error("x")).mockResolvedValue([]);
        inShell(<AutomationList />, "viewer");
        expect(await screen.findByText("Could not load the automations.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "+ New automation" })).not.toBeInTheDocument();
        const { unmount } = render(<CrmAutomationsPage {...({} as any)} />);
        expect(await screen.findByText(/No automations yet/)).toBeInTheDocument();
        unmount();
        api.getAutomation.mockResolvedValue(automation());
        render(<CrmAutomationPage {...({ params: { uid: "a1" } } as any)} />);
        expect(await screen.findAllByLabelText("Automation name")).not.toHaveLength(0);
    });
});

describe("AutomationEditor", () => {
    it("says when the automation can't be loaded", async () => {
        api.getAutomation.mockRejectedValue(new ApiRequestError("Not found.", 404));
        api.listLists.mockRejectedValue(new Error("x"));
        api.listSegments.mockRejectedValue(new Error("x"));
        inShell(<AutomationEditor uid="a1" />);
        expect(await screen.findByText("Not found.")).toBeInTheDocument();
    });

    it("builds a flow: adds steps and branches, jumps back, and removes steps", async () => {
        api.updateAutomation.mockImplementation(async (_w: string, _u: string, input: any) => automation({ ...input, version: 1 }));
        await renderEditor();
        expect(button("Step trigger")).toHaveTextContent("When a contact subscribes to a list");
        await userEvent.selectOptions(screen.getByLabelText("Add a step after trigger"), "send_email");
        expect(settings().getByRole("heading", { name: "Send an email" })).toBeInTheDocument();
        await userEvent.selectOptions(screen.getByLabelText("Add a step after send-email-1"), "wait");
        await userEvent.selectOptions(settings().getByLabelText("The email sent by"), "send-email-1");
        await userEvent.selectOptions(screen.getByLabelText("Add a step after wait-1 (It didn't)"), "delay");
        await userEvent.selectOptions(screen.getByLabelText("Add a step after delay-1"), "goto:send-email-1");
        expect(screen.getByRole("button", { name: "↪ Go to send-email-1" })).toBeInTheDocument();
        await userEvent.click(button("↪ Go to send-email-1"));
        expect(settings().getByRole("heading", { name: "Send an email" })).toBeInTheDocument();
        await userEvent.selectOptions(screen.getByLabelText("Add a step after wait-1 (It happened)"), "");
        await select("delay-1");
        await userEvent.click(settings().getByRole("button", { name: "Remove this step" }));
        expect(screen.queryByRole("button", { name: "Step delay-1" })).not.toBeInTheDocument();
        expect(settings().queryByRole("heading")).not.toBeInTheDocument();
        await select("trigger");
        expect(settings().queryByRole("button", { name: "Remove this step" })).not.toBeInTheDocument();
        await userEvent.click(button("Save draft"));
        expect(api.updateAutomation.mock.lastCall[2].graph.edges).toEqual([
            { from: "trigger", to: "send-email-1", port: "next" },
            { from: "send-email-1", to: "wait-1", port: "next" },
            // The delay's place is taken by where it led: back to the email.
            { from: "wait-1", to: "send-email-1", port: "timeout" },
        ]);
        expect(button("Saved")).toBeDisabled();
    });

    it("sets up every kind of step", async () => {
        api.updateAutomation.mockImplementation(async (_w: string, _u: string, input: any) => automation({ ...input }));
        await renderEditor(automation({ graph: everyStep() }));
        const s = settings;

        await select("trigger");
        for (const [event, picker, value] of [
            ["list.unsubscribed", "List", "l1"],
            ["form.submitted", "Form", "f1"],
            ["segment.left", "Segment", "sg1"],
        ]) {
            await userEvent.selectOptions(s().getByLabelText("When a contact"), event);
            await userEvent.selectOptions(s().getByLabelText(picker), value);
        }
        await userEvent.selectOptions(s().getByLabelText("When a contact"), "contact.updated");
        await userEvent.type(s().getByLabelText(/Only when these fields change/), "leadStatus, score");
        await userEvent.clear(s().getByLabelText(/Only when these fields change/));
        await userEvent.type(s().getByLabelText(/Only when these fields change/), "leadStatus");
        await userEvent.click(s().getByRole("button", { name: /Add condition/ }));
        await userEvent.selectOptions(s().getByLabelText("Field 1"), "tags");
        await userEvent.type(s().getByLabelText("Value 1"), "vip");
        await userEvent.click(s().getByRole("button", { name: "Remove condition 1" }));

        await select("delay");
        await userEvent.clear(s().getByLabelText("Wait"));
        await userEvent.type(s().getByLabelText("Wait"), "3");
        await userEvent.selectOptions(s().getByLabelText("Unit"), "hours");
        await userEvent.clear(s().getByLabelText("Wait"));

        await select("wait");
        await userEvent.selectOptions(s().getByLabelText("Until the contact"), "email.clicked");
        await userEvent.selectOptions(s().getByLabelText("The email sent by"), "send");
        await userEvent.type(s().getByLabelText("At most"), "2");
        await userEvent.selectOptions(s().getByLabelText("Unit"), "days");

        await select("cond");
        await userEvent.click(s().getByRole("button", { name: /Add condition/ }));
        await userEvent.selectOptions(s().getByLabelText("Field 1"), "segments");
        await userEvent.selectOptions(s().getByLabelText("Value 1"), "sg1");

        await select("split");
        await userEvent.type(s().getByLabelText("Share taking path A (%)"), "30");

        await select("send");
        await userEvent.selectOptions(s().getByLabelText("Email"), "t1");
        await userEvent.selectOptions(s().getByLabelText("From"), "s1");
        expect(s().getByRole("option", { name: "hi@acme.example" })).toBeInTheDocument();
        await userEvent.type(s().getByLabelText("Subject (empty: the template's)"), "Hi");

        await select("field");
        await userEvent.selectOptions(s().getByLabelText("Field"), "leadStatus");
        await userEvent.selectOptions(s().getByLabelText("Field"), "lifecycleStage");
        await userEvent.selectOptions(s().getByLabelText("Value"), "lead");
        await userEvent.selectOptions(s().getByLabelText("Field"), "ownerUserUid");
        await userEvent.selectOptions(s().getByLabelText("Member"), "u2");
        await userEvent.selectOptions(s().getByLabelText("Member"), "");
        await userEvent.selectOptions(s().getByLabelText("Field"), "leadStatus");
        await userEvent.type(s().getByLabelText("Value"), "hot");

        await select("tag");
        await userEvent.type(s().getByLabelText("Tag"), "vip");
        await select("untag");
        await userEvent.type(s().getByLabelText("Tag"), "cold");
        await select("sub");
        await userEvent.selectOptions(s().getByLabelText("List"), "l1");
        await select("unsub");
        await userEvent.selectOptions(s().getByLabelText("List"), "l1");
        await select("task");
        await userEvent.type(s().getByLabelText("Title"), "Call");
        await userEvent.type(s().getByLabelText("Due in (days, empty: no due date)"), "2");
        await userEvent.selectOptions(s().getByLabelText("Assigned to"), "u1");
        await select("notify");
        await userEvent.selectOptions(s().getByLabelText("Member"), "u1");
        await userEvent.type(s().getByLabelText("Message"), "Hot lead");
        await select("enroll");
        expect(s().queryByRole("option", { name: "Welcome" })).not.toBeInTheDocument();
        await userEvent.selectOptions(s().getByLabelText("Automation"), "a2");
        await select("end");
        expect(s().getByText("The contact leaves the automation here.")).toBeInTheDocument();

        // The flow says what each step does.
        expect(button("Step send")).toHaveTextContent('Send "Welcome"');
        expect(button("Step enroll")).toHaveTextContent('Put into "Nurture"');
        expect(button("Step sub")).toHaveTextContent("Subscribe to Newsletter");
        expect(button("Step notify")).toHaveTextContent("Notify Olive Owner");

        await userEvent.click(button("Save draft"));
        const nodes = Object.fromEntries(api.updateAutomation.mock.lastCall[2].graph.nodes.map((node: any) => [node.id, node.config]));
        expect(nodes.trigger).toMatchObject({ event: "contact.updated", fields: ["leadStatus"] });
        expect(nodes.trigger.filter ?? null).toBeNull();
        expect(nodes.delay).toMatchObject({ amount: undefined, unit: "hours" });
        expect(nodes.wait).toMatchObject({ event: "email.clicked", sendNodeId: "send", timeoutAmount: 2, timeoutUnit: "days" });
        expect(nodes.cond).toEqual({ filter: { field: "segments", op: "eq", value: "sg1" } });
        expect(nodes.split.percent).toBe(30);
        expect(nodes.send).toEqual({ templateUid: "t1", senderUid: "s1", subject: "Hi" });
        expect(nodes.field).toEqual({ field: "leadStatus", value: "hot" });
        expect(nodes.task).toEqual({ title: "Call", dueInDays: 2, assigneeUserUid: "u1" });
        expect(nodes.notify).toEqual({ userUid: "u1", message: "Hot lead" });
        expect(nodes.enroll).toEqual({ automationUid: "a2" });
    }, 60_000);

    it("posts to a webhook, and starts from a named event reported through the API", async () => {
        api.listWebhooks.mockResolvedValue([
            { uid: "w1", url: "https://hooks.example.com/in", description: "Zapier", events: ["*"], enabled: true },
            { uid: "w2", url: "https://other.example.com/", description: null, events: ["*"], enabled: true },
        ]);
        api.updateAutomation.mockImplementation(async (_w: string, _u: string, input: any) => automation({ ...input }));
        await renderEditor(automation({ graph: { nodes: [{ id: "trigger", type: "trigger", config: { event: "list.subscribed" } }], edges: [] } }));
        await select("trigger");
        await userEvent.selectOptions(settings().getByLabelText("When a contact"), "custom");
        await userEvent.type(settings().getByLabelText("Event name (empty: any event)"), "trial.started");
        expect(button("Step trigger")).toHaveTextContent('When a contact has an event reported by your systems (api) named "trial.started"');
        await userEvent.selectOptions(screen.getByLabelText("Add a step after trigger"), "webhook");
        expect(button("Step webhook-1")).toHaveTextContent("Post to a webhook…");
        await userEvent.selectOptions(settings().getByLabelText("Webhook"), "w2");
        expect(button("Step webhook-1")).toHaveTextContent("Post to https://other.example.com/");
        await userEvent.selectOptions(settings().getByLabelText("Webhook"), "w1");
        expect(button("Step webhook-1")).toHaveTextContent("Post to Zapier");
        await userEvent.click(button("Save draft"));
        const nodes = Object.fromEntries(api.updateAutomation.mock.lastCall[2].graph.nodes.map((node: any) => [node.id, node.config]));
        expect(nodes.trigger).toMatchObject({ event: "custom", name: "trial.started" });
        expect(nodes["webhook-1"]).toEqual({ endpointUid: "w1" });
    });

    it("describes steps with missing settings", () => {
        const data: any = { lists: [], forms: [], segments: [], templates: [], senders: [], members: [], automations: [], webhooks: [] };
        const node = (type: string, config: Record<string, unknown> = {}) => describeStep({ id: "x", type: type as any, config }, data);
        expect(node("trigger", { event: "mystery" })).toBe("When a contact …");
        expect(node("delay")).toBe("Wait ? ");
        expect(node("wait")).toBe("Wait up to ?  for  of ?");
        expect(node("condition")).toBe("If … (set the conditions)");
        expect(node("condition", { filter: {} })).toBe("If the contact matches the conditions");
        expect(node("split")).toBe("50% take path A, the rest path B");
        expect(node("set_field", { field: "leadStatus" })).toBe("Set leadStatus to nothing");
        expect(node("add_tag")).toBe('Add the tag "…"');
        expect(node("remove_tag")).toBe('Remove the tag "…"');
        expect(node("unsubscribe")).toBe("Unsubscribe from …");
        expect(node("create_task")).toBe('Create the task "…"');
        expect(node("notify")).toBe("Notify a member");
        expect(node("trigger", { event: "custom" })).toBe("When a contact has an event reported by your systems (api)");
    });

    it("publishes (saving first), pauses and resumes, and shows the numbers", async () => {
        const published = automation({ status: "active", publishedVersionUid: "v1", graph: everyStep() });
        api.changeAutomation
            .mockRejectedValueOnce(new ApiRequestError("An automation needs exactly one trigger.", 400))
            .mockResolvedValueOnce(published)
            .mockResolvedValueOnce({ ...published, status: "paused" })
            .mockResolvedValueOnce(published);
        api.updateAutomation.mockImplementation(async (_w: string, _u: string, input: any) => automation({ ...input, graph: everyStep() }));
        api.automationReport.mockResolvedValue({
            states: { active: 2, waiting: 1, completed: 5, exited: 0, failed: 1 },
            nodes: { send: { current: 0, sent: 8, opened: 4, clicked: 2, replied: 1 }, wait: { current: 3 }, delay: { current: 0 } },
        });
        await renderEditor(automation({ graph: everyStep() }));
        await userEvent.type(screen.getByLabelText("Automation name"), "!");
        await userEvent.click(button("Publish"));
        expect(await screen.findByText("An automation needs exactly one trigger.")).toBeInTheDocument();
        expect(api.updateAutomation).toHaveBeenCalledTimes(1);
        await userEvent.click(button("Publish"));
        expect(await screen.findByText(/Published\. New contacts/)).toBeInTheDocument();
        expect(await screen.findByText(/3 in it now · 5 finished · 0 taken out · 1 failed/)).toBeInTheDocument();
        expect(button("Step send")).toHaveTextContent("8 sent · 4 opened · 2 clicked · 1 replied");
        expect(button("Step wait")).toHaveTextContent("3 here now");
        await userEvent.click(button("Pause"));
        expect(await screen.findByText("Paused")).toBeInTheDocument();
        await userEvent.click(button("Resume"));
        expect(await screen.findByRole("button", { name: "Pause" })).toBeInTheDocument();
    });

    it("loads the numbers of a published automation, or goes without them", async () => {
        api.automationReport.mockRejectedValue(new Error("x"));
        await renderEditor(automation({ status: "active", publishedVersionUid: "v1" }));
        await waitFor(() => expect(api.automationReport).toHaveBeenCalled());
        expect(screen.queryByText(/in it now/)).not.toBeInTheDocument();
    });

    it("changes the automation's settings", async () => {
        api.updateAutomation.mockImplementation(async (_w: string, _u: string, input: any) => automation(input));
        await renderEditor(automation({ goalFilter: { field: "lifecycleStage", op: "eq", value: "customer" } }));
        await userEvent.click(screen.getByRole("tab", { name: "settings" }));
        await userEvent.type(screen.getByLabelText("Description"), "Hi");
        await userEvent.click(screen.getByLabelText("Again, once they've finished"));
        await userEvent.click(screen.getByLabelText("Once only"));
        await userEvent.click(screen.getByLabelText("Again, once they've finished"));
        await userEvent.click(button("Remove condition 1"));
        await userEvent.click(button("Save settings"));
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        expect(api.updateAutomation.mock.lastCall[2]).toMatchObject({ description: "Hi", reentry: "after_exit", goalFilter: null });
        await userEvent.clear(screen.getByLabelText("Description"));
        api.updateAutomation.mockRejectedValueOnce(new Error("x"));
        await userEvent.click(button("Save settings"));
        expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
        expect(api.updateAutomation.mock.lastCall[2].description).toBeNull();
    });

    it("lists the contacts in it, and takes one out", async () => {
        const enrollment = (overrides: Record<string, unknown>) => ({ uid: "e", contactUid: "c1", email: "ann@x.example", state: "waiting", currentNodeId: "wait", enteredAt: "2026-09-30T10:00:00.000Z", history: [], ...overrides });
        api.listEnrollments
            .mockResolvedValueOnce({ items: [enrollment({ uid: "e1" }), enrollment({ uid: "e2", email: undefined, state: "failed", error: "Step s failed" })], total: 120 })
            .mockResolvedValue({ items: [], total: 120 });
        api.exitEnrollment.mockRejectedValueOnce(new Error("x")).mockResolvedValue(enrollment({ state: "exited" }));
        await renderEditor();
        await userEvent.click(screen.getByRole("tab", { name: "Contacts in it" }));
        expect(await screen.findByRole("link", { name: "ann@x.example" })).toHaveAttribute("href", "/crm/contacts/c1?w=w1");
        expect(screen.getByText("Step s failed")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "c1" })).toBeInTheDocument();
        await userEvent.click(button("Take out"));
        expect(await screen.findByText("Could not take the contact out.")).toBeInTheDocument();
        await userEvent.click(button("Take out"));
        await waitFor(() => expect(api.exitEnrollment).toHaveBeenCalledTimes(2));
        await userEvent.click(button("Next page"));
        expect(await screen.findByText("Nobody yet.")).toBeInTheDocument();
        await userEvent.click(button("Previous page"));
        await userEvent.selectOptions(screen.getByLabelText("Where"), "failed");
        await waitFor(() => expect(api.listEnrollments).toHaveBeenLastCalledWith("w1", "a1", { state: "failed", page: 0, limit: 50 }));
        api.listEnrollments.mockRejectedValueOnce(new Error("x"));
        await userEvent.selectOptions(screen.getByLabelText("Where"), "");
        expect(await screen.findByText("Could not load the contacts.")).toBeInTheDocument();
    });

    it("shows viewers the flow without anything to change", async () => {
        await renderEditor(automation({ status: "active", graph: everyStep() }), "viewer");
        expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Add a step after/)).not.toBeInTheDocument();
        await select("send");
        expect(settings().getByRole("group")).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Automation name"), { target: { value: "x" } });
    });
});
