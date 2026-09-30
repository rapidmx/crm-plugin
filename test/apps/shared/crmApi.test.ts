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

    it("calls each template and saved block endpoint", async () => {
        const calls = recordCalls(() => jsonResponse(200, {}));
        const design = { theme: {} as any, sections: [] };
        await api.searchTemplates("w", 2);
        await api.searchTemplates("w", 0, 10);
        await api.getTemplate("w", "t");
        await api.createTemplate("w", { name: "T", subject: "S" });
        await api.updateTemplate("w", "t", { name: "U", version: 3 });
        await api.deleteTemplate("w", "t");
        await api.duplicateTemplate("w", "t");
        await api.renderTemplate("w", { design, subject: "S" });
        await api.sendTestTemplate("w", "t", { to: "a@x.example", senderUid: "s" });
        await api.listMergeTags("w");
        await api.listSavedBlocks("w");
        await api.createSavedBlock("w", { name: "B", blocks: [] });
        await api.deleteSavedBlock("w", "b");
        expect(calls).toEqual([
            'POST /api/mail/crm/templates/w/search {"sort":{"field":"name","direction":"asc"},"limit":100,"page":2}',
            'POST /api/mail/crm/templates/w/search {"sort":{"field":"name","direction":"asc"},"limit":10,"page":0}',
            "GET /api/mail/crm/templates/w/t",
            'POST /api/mail/crm/templates/w {"name":"T","subject":"S"}',
            'PUT /api/mail/crm/templates/w/t {"name":"U","version":3}',
            "DELETE /api/mail/crm/templates/w/t",
            "POST /api/mail/crm/templates/w/t/duplicate {}",
            'POST /api/mail/crm/templates/w/render {"design":{"theme":{},"sections":[]},"subject":"S"}',
            'POST /api/mail/crm/templates/w/t/test {"to":"a@x.example","senderUid":"s"}',
            "GET /api/mail/crm/templates/w/merge-tags",
            "GET /api/mail/crm/saved-blocks/w?limit=200",
            'POST /api/mail/crm/saved-blocks/w {"name":"B","blocks":[]}',
            "DELETE /api/mail/crm/saved-blocks/w/b",
        ]);
    });

    it("calls each campaign endpoint", async () => {
        const calls = recordCalls(() => jsonResponse(200, {}));
        await api.searchCampaigns("w", 1);
        await api.getCampaign("w", "c");
        await api.createCampaign("w", { name: "C" });
        await api.updateCampaign("w", "c", { name: "D", version: 2 });
        await api.deleteCampaign("w", "c");
        await api.duplicateCampaign("w", "c");
        await api.campaignChecklist("w", "c");
        await api.scheduleCampaign("w", "c");
        await api.scheduleCampaign("w", "c", "2026-10-01T09:00:00.000Z");
        await api.changeCampaign("w", "c", "pause");
        await api.campaignAudience("w", { listUids: ["l"], excludeListUids: [] });
        await api.campaignReport("w", "c");
        await api.campaignRecipients("w", "c", { status: "sent", page: 0 });
        expect(calls).toEqual([
            'POST /api/mail/crm/campaigns/w/search {"limit":50,"page":1}',
            "GET /api/mail/crm/campaigns/w/c",
            'POST /api/mail/crm/campaigns/w {"name":"C"}',
            'PUT /api/mail/crm/campaigns/w/c {"name":"D","version":2}',
            "DELETE /api/mail/crm/campaigns/w/c",
            "POST /api/mail/crm/campaigns/w/c/duplicate {}",
            "GET /api/mail/crm/campaigns/w/c/checklist",
            "POST /api/mail/crm/campaigns/w/c/schedule {}",
            'POST /api/mail/crm/campaigns/w/c/schedule {"sendAt":"2026-10-01T09:00:00.000Z"}',
            "POST /api/mail/crm/campaigns/w/c/pause {}",
            'POST /api/mail/crm/campaigns/w/audience {"listUids":["l"],"excludeListUids":[]}',
            "GET /api/mail/crm/campaigns/w/c/report",
            'POST /api/mail/crm/campaigns/w/c/recipients {"status":"sent","page":0}',
        ]);
    });

    it("calls each segment and scoring rule endpoint", async () => {
        const calls = recordCalls(() => jsonResponse(200, {}));
        const filter = { field: "tags", op: "eq", value: "vip" };
        await api.listSegments("w");
        await api.createSegment("w", { name: "S", filter });
        await api.updateSegment("w", "s", { name: "T" });
        await api.deleteSegment("w", "s");
        await api.refreshSegment("w", "s");
        await api.previewSegment("w", filter);
        await api.listScoringRules("w");
        await api.createScoringRule("w", { name: "R", kind: "property", filter, points: 5 });
        await api.updateScoringRule("w", "r", { enabled: false });
        await api.deleteScoringRule("w", "r");
        await api.recalculateScores("w");
        expect(calls).toEqual([
            "GET /api/mail/crm/segments/w?limit=200",
            'POST /api/mail/crm/segments/w {"name":"S","filter":{"field":"tags","op":"eq","value":"vip"}}',
            'PUT /api/mail/crm/segments/w/s {"name":"T"}',
            "DELETE /api/mail/crm/segments/w/s",
            "POST /api/mail/crm/segments/w/s/refresh {}",
            'POST /api/mail/crm/segments/w/preview {"filter":{"field":"tags","op":"eq","value":"vip"}}',
            "GET /api/mail/crm/scoring-rules/w?limit=50",
            'POST /api/mail/crm/scoring-rules/w {"name":"R","kind":"property","filter":{"field":"tags","op":"eq","value":"vip"},"points":5}',
            'PUT /api/mail/crm/scoring-rules/w/r {"enabled":false}',
            "DELETE /api/mail/crm/scoring-rules/w/r",
            "POST /api/mail/crm/scoring-rules/w/recalculate {}",
        ]);
    });

    it("calls each automation endpoint", async () => {
        const calls = recordCalls(() => jsonResponse(200, {}));
        await api.listAutomations("w");
        await api.getAutomation("w", "a");
        await api.createAutomation("w", { name: "A" });
        await api.updateAutomation("w", "a", { name: "B" });
        await api.deleteAutomation("w", "a");
        await api.changeAutomation("w", "a", "publish");
        await api.enrollInAutomation("w", "a", ["c"]);
        await api.automationReport("w", "a");
        await api.listEnrollments("w", "a", { page: 0 });
        await api.exitEnrollment("w", "a", "e");
        expect(calls).toEqual([
            "GET /api/mail/crm/automations/w?limit=200",
            "GET /api/mail/crm/automations/w/a",
            'POST /api/mail/crm/automations/w {"name":"A"}',
            'PUT /api/mail/crm/automations/w/a {"name":"B"}',
            "DELETE /api/mail/crm/automations/w/a",
            "POST /api/mail/crm/automations/w/a/publish {}",
            'POST /api/mail/crm/automations/w/a/enroll {"contactUids":["c"]}',
            "GET /api/mail/crm/automations/w/a/report",
            'POST /api/mail/crm/automations/w/a/enrollments {"page":0}',
            "POST /api/mail/crm/automations/w/a/enrollments/e/exit {}",
        ]);
    });

    it("calls each pipeline, deal and sender endpoint", async () => {
        const calls = recordCalls(() => jsonResponse(200, {}));
        await api.listPipelines("w");
        await api.createPipeline("w", { name: "P" });
        await api.updatePipeline("w", "p", { isDefault: true });
        await api.deletePipeline("w", "p");
        await api.listDeals("w");
        await api.listDeals("w", { pipelineUid: "p", status: "open", ownerUserUid: undefined });
        await api.getDeal("w", "d");
        await api.createDeal("w", { name: "D" });
        await api.updateDeal("w", "d", { stageId: "s" });
        await api.deleteDeal("w", "d");
        await api.dealForecast("w", "p");
        await api.updateSender("w", "s", { logEmail: true });
        expect(calls).toEqual([
            "GET /api/mail/crm/pipelines/w?limit=50",
            'POST /api/mail/crm/pipelines/w {"name":"P"}',
            'PUT /api/mail/crm/pipelines/w/p {"isDefault":true}',
            "DELETE /api/mail/crm/pipelines/w/p",
            "GET /api/mail/crm/deals/w?limit=200",
            "GET /api/mail/crm/deals/w?limit=200&pipelineUid=p&status=open",
            "GET /api/mail/crm/deals/w/d",
            'POST /api/mail/crm/deals/w {"name":"D"}',
            'PUT /api/mail/crm/deals/w/d {"stageId":"s"}',
            "DELETE /api/mail/crm/deals/w/d",
            "GET /api/mail/crm/deals/w/forecast?pipelineUid=p&days=90",
            'PUT /api/mail/crm/workspaces/w/senders/s {"logEmail":true}',
        ]);
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

    it("calls each report, webhook, API key and administration endpoint", async () => {
        const calls = recordCalls(() => jsonResponse(200, {}));
        await api.emailReport("w", 7);
        await api.growthReport("w", 30);
        await api.salesReport("w", 90);
        await api.salesReport("w", 90, "p");
        await api.listWebhooks("w");
        await api.createWebhook("w", { url: "https://x.example" });
        await api.updateWebhook("w", "h", { enabled: false });
        await api.deleteWebhook("w", "h");
        await api.rotateWebhookSecret("w", "h");
        await api.testWebhook("w", "h");
        await api.webhookDeliveries("w", "h");
        await api.listApiKeys("w");
        await api.createApiKey("w", { name: "K", scopes: ["events"] });
        await api.updateApiKey("w", "k", { name: "L" });
        await api.deleteApiKey("w", "k");
        await api.adminStats();
        await api.adminWorkspaces(2);
        await api.setWorkspaceSending("w", true);
        expect(calls).toEqual([
            "GET /api/mail/crm/analytics/w/email?days=7",
            "GET /api/mail/crm/analytics/w/growth?days=30",
            "GET /api/mail/crm/analytics/w/sales?days=90",
            "GET /api/mail/crm/analytics/w/sales?days=90&pipelineUid=p",
            "GET /api/mail/crm/webhooks/w?limit=50",
            'POST /api/mail/crm/webhooks/w {"url":"https://x.example"}',
            'PUT /api/mail/crm/webhooks/w/h {"enabled":false}',
            "DELETE /api/mail/crm/webhooks/w/h",
            "POST /api/mail/crm/webhooks/w/h/secret",
            "POST /api/mail/crm/webhooks/w/h/test",
            "GET /api/mail/crm/webhooks/w/h/deliveries",
            "GET /api/mail/crm/api-keys/w?limit=50",
            'POST /api/mail/crm/api-keys/w {"name":"K","scopes":["events"]}',
            'PUT /api/mail/crm/api-keys/w/k {"name":"L"}',
            "DELETE /api/mail/crm/api-keys/w/k",
            "GET /api/mail/crm/admin/stats",
            "GET /api/mail/crm/admin/workspaces?limit=50&page=2",
            'PUT /api/mail/crm/admin/workspaces/w {"sendingDisabled":true}',
        ]);
    });

    it("words errors", () => {
        expect(api.errorMessage(new ApiRequestError("Nope", 400), "Fallback")).toBe("Nope");
        expect(api.errorMessage(new Error("x"), "Fallback")).toBe("Fallback");
    });
});
