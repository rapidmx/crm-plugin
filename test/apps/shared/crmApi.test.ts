// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@rapidmx/web-client/lib/util/api.js";
import * as api from "../../../apps/shared/crmApi.js";
import { emptyResponse, jsonResponse, mockFetch } from "../testUtils.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

/** Every call the API makes, as `METHOD url body`. */
function recordCalls(respond: (url: string) => Response = () => jsonResponse(200, {})) {
    const calls: string[] = [];
    mockFetch((url, init) => {
        calls.push(`${init?.method ?? "GET"} ${url}${init?.body && typeof init.body === "string" ? ` ${init.body}` : ""}`);
        return respond(url);
    });
    return calls;
}

describe("crmApi", () => {
    it("calls each workspace, member and sender endpoint", async () => {
        const calls = recordCalls((url) => (url.includes("DELETE") ? emptyResponse(204) : jsonResponse(200, [])));
        await api.listWorkspaces();
        await api.getWorkspace("w 1");
        await api.createWorkspace({ name: "A" });
        await api.updateWorkspace("w", { name: "B" });
        await api.listMembers("w");
        await api.addMember("w", { address: "a@x.example", role: "viewer" });
        await api.updateMember("w", "u", "admin");
        await api.listSenders("w");
        await api.addSender("w", { fromAddress: "s@x.example" });
        expect(calls).toEqual([
            "GET /api/mail/crm/workspaces",
            "GET /api/mail/crm/workspaces/w%201",
            'POST /api/mail/crm/workspaces {"name":"A"}',
            'PUT /api/mail/crm/workspaces/w {"name":"B"}',
            "GET /api/mail/crm/workspaces/w/members",
            'POST /api/mail/crm/workspaces/w/members {"address":"a@x.example","role":"viewer"}',
            'PUT /api/mail/crm/workspaces/w/members/u {"role":"admin"}',
            "GET /api/mail/crm/workspaces/w/senders",
            'POST /api/mail/crm/workspaces/w/senders {"fromAddress":"s@x.example"}',
        ]);
    });

    it("calls each record, property, note, task, timeline and import endpoint", async () => {
        const calls = recordCalls(() => emptyResponse(204));
        await api.deleteWorkspace("w");
        await api.removeMember("w", "u");
        await api.removeSender("w", "s");
        await api.searchRecords("contact", "w", { q: "a" });
        await api.getRecord("company", "w", "c");
        await api.createRecord("contact", "w", { email: "a@x.example" });
        await api.updateRecord("company", "w", "c", { name: "B" });
        await api.deleteRecord("contact", "w", "c");
        await api.bulkRecords("company", "w", { uids: ["c"], action: "delete" });
        await api.listProperties("w");
        await api.listProperties("w", "company");
        await api.createProperty("w", { objectType: "contact", key: "k", label: "K", type: "text" });
        await api.deleteProperty("w", "p");
        await api.listNotes("w", "c");
        await api.createNote("w", { subjectType: "contact", subjectUid: "c", body: "hi" });
        await api.deleteNote("w", "n");
        await api.listTasks("w");
        await api.listTasks("w", { status: "open", assigneeUserUid: "u x", subjectUid: undefined });
        await api.createTask("w", { title: "t" });
        await api.updateTask("w", "t", { status: "done" });
        await api.deleteTask("w", "t");
        await api.listTimeline("w", "contact", "c");
        await api.listImports("w");
        await api.getImport("w", "i");
        await api.startImport("w", "i", { mapping: [], updateExisting: true, tags: [] });
        await api.deleteImport("w", "i");
        await api.listLists("w");
        await api.createList("w", { name: "L" });
        await api.updateList("w", "l", { name: "M" });
        await api.deleteList("w", "l");
        await api.listSubscriptions("w", "c");
        await api.setSubscriptions("w", { listUid: "l", contactUids: ["c"], status: "subscribed" });
        await api.listSuppressions("w");
        await api.createSuppression("w", { email: "a@x.example" });
        await api.deleteSuppression("w", "x");
        await api.listForms("w");
        await api.createForm("w", { name: "F" });
        await api.updateForm("w", "f", { name: "G" });
        await api.deleteForm("w", "f");
        expect(calls).toEqual([
            "DELETE /api/mail/crm/workspaces/w",
            "DELETE /api/mail/crm/workspaces/w/members/u",
            "DELETE /api/mail/crm/workspaces/w/senders/s",
            'POST /api/mail/crm/contacts/w/search {"q":"a"}',
            "GET /api/mail/crm/companies/w/c",
            'POST /api/mail/crm/contacts/w {"email":"a@x.example"}',
            'PUT /api/mail/crm/companies/w/c {"name":"B"}',
            "DELETE /api/mail/crm/contacts/w/c",
            'POST /api/mail/crm/companies/w/bulk {"uids":["c"],"action":"delete"}',
            "GET /api/mail/crm/properties/w?limit=200",
            "GET /api/mail/crm/properties/w?limit=200&objectType=company",
            'POST /api/mail/crm/properties/w {"objectType":"contact","key":"k","label":"K","type":"text"}',
            "DELETE /api/mail/crm/properties/w/p",
            "GET /api/mail/crm/notes/w?limit=200&subjectUid=c",
            'POST /api/mail/crm/notes/w {"subjectType":"contact","subjectUid":"c","body":"hi"}',
            "DELETE /api/mail/crm/notes/w/n",
            "GET /api/mail/crm/tasks/w?limit=200",
            "GET /api/mail/crm/tasks/w?limit=200&status=open&assigneeUserUid=u%20x",
            'POST /api/mail/crm/tasks/w {"title":"t"}',
            'PUT /api/mail/crm/tasks/w/t {"status":"done"}',
            "DELETE /api/mail/crm/tasks/w/t",
            "GET /api/mail/crm/timeline/w/contact/c?limit=100",
            "GET /api/mail/crm/imports/w?limit=50",
            "GET /api/mail/crm/imports/w/i",
            'POST /api/mail/crm/imports/w/i/start {"mapping":[],"updateExisting":true,"tags":[]}',
            "DELETE /api/mail/crm/imports/w/i",
            "GET /api/mail/crm/lists/w?limit=200",
            'POST /api/mail/crm/lists/w {"name":"L"}',
            'PUT /api/mail/crm/lists/w/l {"name":"M"}',
            "DELETE /api/mail/crm/lists/w/l",
            "GET /api/mail/crm/subscriptions/w?limit=500&contactUid=c",
            'POST /api/mail/crm/subscriptions/w {"listUid":"l","contactUids":["c"],"status":"subscribed"}',
            "GET /api/mail/crm/suppressions/w?limit=200",
            'POST /api/mail/crm/suppressions/w {"email":"a@x.example"}',
            "DELETE /api/mail/crm/suppressions/w/x",
            "GET /api/mail/crm/forms/w?limit=200",
            'POST /api/mail/crm/forms/w {"name":"F"}',
            'PUT /api/mail/crm/forms/w/f {"name":"G"}',
            "DELETE /api/mail/crm/forms/w/f",
        ]);
        expect(api.recordPath("company")).toBe("companies");
    });

    it("uploads a CSV file as the raw body and reads the answer", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { import: { uid: "i" }, targets: [], preview: [] }));
        const file = new File(["email\na@x.example"], "people list.csv", { type: "text/csv" });

        expect((await api.uploadImport("w", "contact", file)).import.uid).toBe("i");

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/mail/crm/imports/w?objectType=contact&fileName=people%20list.csv");
        expect(init.method).toBe("POST");
        expect(init.body).toBe(file);
        expect(new Headers(init.headers).get("content-type")).toBe("text/csv");
    });

    it("turns a failed upload into an ApiRequestError with the server's message, or a generic one", async () => {
        const file = new File(["x"], "x.csv");
        mockFetch(() => jsonResponse(400, { message: "The file needs a header row." }));
        await expect(api.uploadImport("w", "contact", file)).rejects.toMatchObject({ message: "The file needs a header row.", status: 400 });
        mockFetch(() => new Response("oops", { status: 500 }));
        await expect(api.uploadImport("w", "contact", file)).rejects.toMatchObject({ message: "Request failed (500).", status: 500 });
        mockFetch(() => jsonResponse(502, { error: "bad gateway" }));
        await expect(api.uploadImport("w", "contact", file)).rejects.toMatchObject({ message: "Request failed (502)." });
    });

    it("downloads an export as a file", async () => {
        const fetchMock = mockFetch(() => new Response("uid,email\r\n", { status: 200, headers: { "content-type": "text/csv" } }));
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        URL.createObjectURL = vi.fn(() => "blob:x");
        URL.revokeObjectURL = vi.fn();

        await api.exportRecords("contact", "w", { q: "a" });

        expect(fetchMock.mock.calls[0][0]).toBe("/api/mail/crm/contacts/w/export");
        expect(fetchMock.mock.calls[0][1].body).toBe('{"q":"a"}');
        expect(click).toHaveBeenCalled();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");

        mockFetch(() => jsonResponse(404, { message: "Not found" }));
        await expect(api.exportRecords("company", "w", {})).rejects.toBeInstanceOf(ApiRequestError);
    });

    it("words errors", () => {
        expect(api.errorMessage(new ApiRequestError("Nope", 400), "Fallback")).toBe("Nope");
        expect(api.errorMessage(new Error("x"), "Fallback")).toBe("Fallback");
    });
});
