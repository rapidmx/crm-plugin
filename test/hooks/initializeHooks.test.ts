///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Unit tests for the `@Init` hooks of the CRM's routes and jobs, which build each repository and collaborating route once through
// the ObjectFactory instead of lazily inside the handlers.
import { AutomationRunJob } from "../../src/jobs/AutomationRunJob.js";
import { CrmImportJob } from "../../src/jobs/CrmImportJob.js";
import { CrmJobBase } from "../../src/jobs/CrmJobBase.js";
import { CrmRepoUtils, CrmRepos } from "../../src/models/CrmModelClasses.js";
import { CrmObjectType } from "../../src/models/types.js";
import { BaseIntegrationRoute } from "../../src/routes/BaseIntegrationRoute.js";
import { BasePublicRoute } from "../../src/routes/BasePublicRoute.js";
import { CrmRouteBase } from "../../src/routes/CrmRouteBase.js";

/** A uniquely named stand-in model class. */
function model(name: string): any {
    return { [name]: class {} }[name];
}

/** A model set with two models; the rest are unset. */
function models(): any {
    return { workspace: model("WorkspaceModel"), contact: model("ContactModel"), company: undefined };
}

/** A stand-in ObjectFactory that hands back what it was asked for. */
function factory(): any {
    return { newInstance: vi.fn(async (type: any, options: any) => ({ type, options })) };
}

class TestRoute extends (CrmRouteBase as any) {
    protected classes: any = models();
}
class TestJob extends (CrmJobBase as any) {
    protected classes: any = models();
    public schedule = undefined;
    public run(): void {
        // Never run by these tests.
    }
}
class TestIntegrationRoute extends (BaseIntegrationRoute as any) {
    protected classes: any = models();
    protected contactRouteClass: any = model("IntegrationContactRoute");
}
class TestPublicRoute extends (BasePublicRoute as any) {
    protected classes: any = models();
    protected contactRouteClass: any = model("PublicContactRoute");
}
class TestRunJob extends (AutomationRunJob as any) {
    protected classes: any = models();
    protected contactRouteClass: any = model("RunContactRoute");
}
class TestImportJob extends (CrmImportJob as any) {
    protected classes: any = models();
    protected contactRouteClass: any = model("ImportContactRoute");
    protected companyRouteClass: any = model("ImportCompanyRoute");
}

describe("CrmRepos", () => {
    it("builds the repository of every model that is set, with exactly { name, args }", async () => {
        const classes: any = models();
        const objectFactory: any = factory();
        const repos: CrmRepos = await CrmRepos.create(objectFactory, classes);
        expect(objectFactory.newInstance).toHaveBeenCalledTimes(2);
        expect(objectFactory.newInstance).toHaveBeenCalledWith(CrmRepoUtils, { name: "WorkspaceModel", args: [classes.workspace] });
        expect(objectFactory.newInstance).toHaveBeenCalledWith(CrmRepoUtils, { name: "ContactModel", args: [classes.contact] });
        expect(repos.classes).toBe(classes);
        expect(((await repos.get("contact")) as any).options).toEqual({ name: "ContactModel", args: [classes.contact] });
    });

    it("refuses the repository of a model that is not set", async () => {
        const repos: CrmRepos = await CrmRepos.create(factory(), models());
        await expect(repos.get("company")).rejects.toThrow("The model 'company' is not set.");
    });
});

describe.each([
    ["CrmRouteBase", () => new TestRoute()],
    ["CrmJobBase", () => new TestJob()],
])("%s initializeCrm()", (_name, make) => {
    it("throws without an object factory", async () => {
        await expect((make() as any).initializeCrm()).rejects.toThrow("objectFactory is not set.");
    });

    it("builds the repositories once", async () => {
        const instance: any = make();
        instance._objectFactory = factory();
        await instance.initializeCrm();
        expect(instance._objectFactory.newInstance).toHaveBeenCalledTimes(2);
        expect(instance.repos()).toBeInstanceOf(CrmRepos);
    });

    it("does not rebuild a repository set beforehand", async () => {
        const instance: any = make();
        const preset: any = {};
        instance._objectFactory = factory();
        instance.crmRepos = preset;
        await instance.initializeCrm();
        expect(instance._objectFactory.newInstance).not.toHaveBeenCalled();
        expect(instance.repos()).toBe(preset);
    });

    it("skips when the model classes are not set", async () => {
        const instance: any = make();
        instance._objectFactory = factory();
        instance.classes = undefined;
        await instance.initializeCrm();
        expect(instance._objectFactory.newInstance).not.toHaveBeenCalled();
    });
});

describe.each([
    ["BaseIntegrationRoute", () => new TestIntegrationRoute(), "initializeIntegration", "crm-integrations"],
    ["BasePublicRoute", () => new TestPublicRoute(), "initializePublic", "crm-public"],
    ["AutomationRunJob", () => new TestRunJob(), "initializeAutomationRun", "crm-automations"],
])("%s %s()", (_name, make, hook, instanceName) => {
    it("throws without an object factory", async () => {
        await expect((make() as any)[hook]()).rejects.toThrow("objectFactory is not set.");
    });

    it("builds the contact route with exactly { name }", async () => {
        const instance: any = make();
        instance._objectFactory = factory();
        await instance[hook]();
        expect(instance._objectFactory.newInstance).toHaveBeenCalledTimes(1);
        expect(instance._objectFactory.newInstance).toHaveBeenCalledWith(instance.contactRouteClass, { name: instanceName });
        expect(instance.contactRoute.options).toEqual({ name: instanceName });
    });

    it("does not rebuild a contact route set beforehand", async () => {
        const instance: any = make();
        const preset: any = {};
        instance._objectFactory = factory();
        instance.contactRoute = preset;
        await instance[hook]();
        expect(instance._objectFactory.newInstance).not.toHaveBeenCalled();
        expect(instance.contactRoute).toBe(preset);
    });

    it("skips when the route class is not set", async () => {
        const instance: any = make();
        instance._objectFactory = factory();
        instance.contactRouteClass = undefined;
        await instance[hook]();
        expect(instance._objectFactory.newInstance).not.toHaveBeenCalled();
    });
});

describe("CrmImportJob initialize()", () => {
    it("throws without an object factory", async () => {
        await expect((new TestImportJob() as any).initialize()).rejects.toThrow("objectFactory is not set.");
    });

    it("builds the repositories and both routes with exactly { name }", async () => {
        const job: any = new TestImportJob();
        job._objectFactory = factory();
        await job.initialize();
        expect(job._objectFactory.newInstance).toHaveBeenCalledTimes(4);
        expect(job._objectFactory.newInstance).toHaveBeenCalledWith(job.contactRouteClass, { name: "crm-import" });
        expect(job._objectFactory.newInstance).toHaveBeenCalledWith(job.companyRouteClass, { name: "crm-import" });
        expect(job.repos).toBeInstanceOf(CrmRepos);
        expect(job.route(CrmObjectType.CONTACT)).toBe(job.contactRoute);
        expect(job.route(CrmObjectType.COMPANY)).toBe(job.companyRoute);
    });

    it("does not rebuild anything set beforehand", async () => {
        const job: any = new TestImportJob();
        job._objectFactory = factory();
        job.repos = {};
        job.contactRoute = {};
        job.companyRoute = {};
        await job.initialize();
        expect(job._objectFactory.newInstance).not.toHaveBeenCalled();
    });

    it("skips what is not set", async () => {
        const job: any = new TestImportJob();
        job._objectFactory = factory();
        job.classes = undefined;
        job.contactRouteClass = undefined;
        job.companyRouteClass = undefined;
        await job.initialize();
        expect(job._objectFactory.newInstance).not.toHaveBeenCalled();
    });
});
