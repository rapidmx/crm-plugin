// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// The template list and the template designer: palette, canvas, inspector, undo, saving, preview and test sends.
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@rapidmx/web-client/lib/util/api.js";
import { MockAppShell, contact, emailTemplate, mockCrmApi, stubBasics, workspace } from "../../fixtures.js";
import * as crmApi from "../../../../apps/shared/crmApi.js";
import CrmShell from "../../../../apps/shared/components/CrmShell.js";
import TemplateList from "../../../../apps/shared/components/TemplateList.js";
import TemplateDesigner from "../../../../apps/shared/components/designer/TemplateDesigner.js";
import CrmTemplatesPage from "../../../../apps/crm/templates/index.js";
import CrmTemplatePage from "../../../../apps/crm/templates/[uid].js";

const dnd = vi.hoisted(() => ({ onDragEnd: undefined as undefined | ((event: any) => void) }));

vi.mock("../../../../apps/shared/crmApi.js", (importOriginal) => mockCrmApi(importOriginal));
vi.mock("@rapidmx/web-client/shared/components/layout/AppShell.js", () => ({ default: MockAppShell }));
vi.mock("../../../../apps/shared/components/designer/LazyTextBlockEditor.js", () => ({
    default: ({ value, onChange }: { value: string; onChange: (html: string) => void }) => (
        <textarea aria-label="Text editor" defaultValue={value} onChange={(event) => onChange(event.target.value)} />
    ),
}));
vi.mock("@dnd-kit/core", async (importOriginal) => {
    const actual: any = await importOriginal();
    return {
        ...actual,
        DndContext: (props: any) => {
            dnd.onDragEnd = props.onDragEnd;
            return <actual.DndContext {...props} />;
        },
    };
});

const api: any = crmApi;
const sender = { uid: "s1", fromName: "Acme News", fromAddress: "news@acme.example" };
const tags = [
    { tag: "contact.first_name", label: "First name" },
    { tag: "links.unsubscribe", label: "Unsubscribe link" },
];

function inShell(ui: React.ReactElement) {
    return render(<CrmShell section="templates">{ui}</CrmShell>);
}

async function renderDesigner(role: string = "owner", template: any = emailTemplate()) {
    api.listWorkspaces.mockResolvedValue([workspace({ role })]);
    api.getTemplate.mockResolvedValue(template);
    inShell(<TemplateDesigner uid="t1" />);
    await screen.findByLabelText("Template name");
}

const block = (name: string) => screen.getByRole("group", { name: `${name} block` });
const blocksOf = (section: number) =>
    within(screen.getByRole("group", { name: `Section ${section}` }))
        .queryAllByRole("group")
        .map((element) => element.getAttribute("aria-label")!.replace(" block", ""));
const settings = () => within(screen.getByRole("complementary", { name: "Settings" }));
const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
    stubBasics(api);
    api.listMergeTags.mockResolvedValue(tags);
    api.listSenders.mockResolvedValue([sender]);
    window.localStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, search: "", pathname: "/crm/templates", assign: vi.fn() } });
});

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe("TemplateList", () => {
    it("lists templates, filters them and loads more", async () => {
        api.searchTemplates
            .mockResolvedValueOnce({ items: [emailTemplate(), emailTemplate({ uid: "t2", name: "Promo", subject: "Sale", category: "offers", hasUnsubscribeLink: false })], total: 3 })
            .mockResolvedValueOnce({ items: [emailTemplate(), emailTemplate({ uid: "t2", name: "Promo" })], total: 3 })
            .mockResolvedValueOnce({ items: [emailTemplate({ uid: "t3", name: "Later" })], total: 3 });
        inShell(<TemplateList />);
        expect(await screen.findByText("Promo")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Welcome" })).toHaveAttribute("href", "/crm/templates/t1?w=w1");
        expect(screen.getByText("no unsubscribe link")).toBeInTheDocument();
        expect(screen.getByText("offers")).toBeInTheDocument();

        await userEvent.type(screen.getByLabelText("Filter templates"), "offers");
        expect(screen.queryByText("Welcome")).not.toBeInTheDocument();
        await userEvent.clear(screen.getByLabelText("Filter templates"));
        await userEvent.type(screen.getByLabelText("Filter templates"), "zzz");
        expect(screen.getByText("No templates match.")).toBeInTheDocument();
        await userEvent.clear(screen.getByLabelText("Filter templates"));

        await userEvent.click(button("Show more"));
        expect(await screen.findByText("Later")).toBeInTheDocument();
        expect(api.searchTemplates).toHaveBeenLastCalledWith("w1", 1, 100);
        expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    });

    it("creates, duplicates and deletes templates", async () => {
        api.searchTemplates.mockResolvedValue({ items: [emailTemplate()], total: 1 });
        api.createTemplate.mockRejectedValueOnce(new ApiRequestError("Too many.", 400)).mockResolvedValue(emailTemplate({ uid: "new" }));
        api.duplicateTemplate.mockRejectedValueOnce(new Error("x")).mockResolvedValue(emailTemplate({ uid: "copy" }));
        api.deleteTemplate.mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
        vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
        inShell(<TemplateList />);
        await screen.findByText("Welcome");

        await userEvent.click(button("+ New template"));
        await userEvent.type(screen.getByLabelText("Name"), "Launch");
        await userEvent.type(screen.getByLabelText("Subject"), "It's here");
        await userEvent.click(button("Create and design"));
        expect(await screen.findByText("Too many.")).toBeInTheDocument();
        await userEvent.click(button("Create and design"));
        await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("/crm/templates/new?w=w1"));
        expect(api.createTemplate).toHaveBeenLastCalledWith("w1", { name: "Launch", subject: "It's here" });
        await userEvent.click(button("Close"));

        await userEvent.click(button("Duplicate"));
        expect(await screen.findByText("Could not duplicate the template.")).toBeInTheDocument();
        await userEvent.click(button("Duplicate"));
        await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("/crm/templates/copy?w=w1"));

        await userEvent.click(button("Delete"));
        expect(api.deleteTemplate).not.toHaveBeenCalled();
        await userEvent.click(button("Delete"));
        expect(await screen.findByText("Could not delete the template.")).toBeInTheDocument();
        await userEvent.click(button("Delete"));
        await waitFor(() => expect(api.searchTemplates).toHaveBeenCalledTimes(2));
    });

    it("shows viewers the list only, and says when loading fails", async () => {
        api.listWorkspaces.mockResolvedValue([workspace({ role: "viewer" })]);
        api.searchTemplates.mockRejectedValueOnce(new Error("x"));
        inShell(<TemplateList />);
        expect(await screen.findByText("Could not load the templates.")).toBeInTheDocument();
        expect(screen.getByText("No templates yet.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "+ New template" })).not.toBeInTheDocument();
    });

    it("is the templates page, with the designer page for one template", async () => {
        api.getTemplate.mockResolvedValue(emailTemplate());
        const { unmount } = render(<CrmTemplatesPage {...({} as any)} />);
        expect(await screen.findByRole("heading", { name: "Templates" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Templates" })).toHaveAttribute("aria-current", "page");
        unmount();
        render(<CrmTemplatePage {...({ params: { uid: "t1" } } as any)} />);
        expect(await screen.findByDisplayValue("Welcome")).toBeInTheDocument();
    });
});

describe("TemplateDesigner", () => {
    it("says when the template can't be loaded, and gets by without merge tags, saved blocks or senders", async () => {
        api.getTemplate.mockRejectedValue(new ApiRequestError("Not found.", 404));
        api.listMergeTags.mockRejectedValue(new Error("x"));
        api.listSavedBlocks.mockRejectedValue(new Error("x"));
        api.listSenders.mockRejectedValue(new Error("x"));
        inShell(<TemplateDesigner uid="t1" />);
        expect(await screen.findByText("Not found.")).toBeInTheDocument();
        api.getTemplate.mockRejectedValue(new Error("x"));
        inShell(<TemplateDesigner uid="t1" />);
        expect(await screen.findByText("Could not load the template.")).toBeInTheDocument();
    });

    it("shows viewers the design without anything to change it", async () => {
        await renderDesigner("viewer");
        expect(screen.getByLabelText("Template name")).toHaveAttribute("readonly");
        expect(screen.queryByRole("complementary", { name: "Blocks" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Send test/ })).not.toBeInTheDocument();
        await userEvent.click(block("Heading"));
        expect(screen.queryByRole("button", { name: "Delete block" })).not.toBeInTheDocument();
        expect(settings().getByRole("group")).toBeDisabled();
    });

    it("draws every kind of block", async () => {
        const template = emailTemplate();
        template.design.sections[0].columns[0].blocks = [
            { id: "i1", type: "image", src: "https://acme.example/a.png", alt: "Logo", width: 100 },
            { id: "i2", type: "image", src: "", alt: "" },
            { id: "d", type: "divider", color: "#000000", thickness: 2, padding: 4 },
            { id: "sp", type: "spacer", height: 12 },
            { id: "so", type: "social", links: [{ network: "github", href: "https://github.com/acme" }] },
            { id: "h", type: "html", html: "<table></table>" },
            { id: "f", type: "footer", note: "You signed up." },
            { id: "t", type: "text", html: "<p>Styled</p>", color: "#333333", fontSize: 18, align: "center", padding: 2 },
            { id: "b", type: "button", text: "Buy", href: "https://x", color: "#000000", backgroundColor: "#ffff00", borderRadius: 9, align: "left" },
            { id: "hd", type: "heading", text: "Small", level: 3, color: "#123456" },
        ];
        template.design.sections[1] = { id: "s2", backgroundColor: "#eeeeee", padding: 8, columns: [{ id: "c2", blocks: [] }, { id: "c3", blocks: [{ id: "f2", type: "footer", color: "#000000", align: "left" }] }] };
        await renderDesigner("owner", template);
        expect(screen.getByRole("img", { name: "Logo" })).toHaveAttribute("src", "https://acme.example/a.png");
        expect(screen.getByText("Choose an image in the settings")).toBeInTheDocument();
        expect(screen.getByLabelText("Spacer")).toHaveStyle({ height: "12px" });
        expect(screen.getByText("github")).toBeInTheDocument();
        expect(screen.getByText("<table></table>")).toBeInTheDocument();
        expect(screen.getByText("You signed up.")).toBeInTheDocument();
        expect(screen.getByText("Styled")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Small", level: 3 })).toBeInTheDocument();
        expect(screen.getByText("Empty column")).toBeInTheDocument();
        expect(screen.getAllByText("Unsubscribe")).toHaveLength(2);
    });

    it("adds blocks and sections from the palette where the selection is", async () => {
        await renderDesigner();
        const palette = within(screen.getByRole("complementary", { name: "Blocks" }));
        // Nothing selected: the end of the last section.
        await userEvent.click(palette.getByRole("button", { name: "Divider" }));
        expect(blocksOf(2)).toEqual(["Footer", "Divider"]);
        // A block selected (the new one is): right after it.
        await userEvent.click(block("Heading"));
        await userEvent.click(palette.getByRole("button", { name: "Spacer" }));
        expect(blocksOf(1)).toEqual(["Heading", "Spacer", "Text", "Button"]);
        // A section selected: the end of its first column.
        await userEvent.click(screen.getByRole("group", { name: "Section 1" }));
        await userEvent.click(palette.getByRole("button", { name: "Image" }));
        expect(blocksOf(1).at(-1)).toBe("Image");
        for (const name of ["Heading", "Text", "Button", "Social links", "Footer", "HTML"]) {
            await userEvent.click(palette.getByRole("button", { name }));
        }
        expect(blocksOf(1).slice(-6)).toEqual(["Heading", "Text", "Button", "Social links", "Footer", "HTML"]);

        await userEvent.click(screen.getByRole("group", { name: "Section 1" }));
        await userEvent.click(palette.getByRole("button", { name: "2 columns" }));
        expect(screen.getAllByRole("group", { name: /^Section / })).toHaveLength(3);
        expect(within(screen.getByRole("group", { name: "Section 2" })).getAllByText("Empty column")).toHaveLength(2);
        await userEvent.click(button("Theme"));
        await userEvent.click(palette.getByRole("button", { name: "1 column" }));
        expect(screen.getAllByRole("group", { name: /^Section / })).toHaveLength(4);
        for (const name of ["3 columns", "4 columns"]) {
            await userEvent.click(palette.getByRole("button", { name }));
        }
        expect(screen.getAllByRole("group", { name: /^Section / })).toHaveLength(6);
    });

    it("starts a section when a block is added to a design without any", async () => {
        const template = emailTemplate();
        template.design.sections = [];
        await renderDesigner("owner", template);
        expect(screen.getByText("Add a section from the panel on the left to start.")).toBeInTheDocument();
        await userEvent.click(within(screen.getByRole("complementary", { name: "Blocks" })).getByRole("button", { name: "Text" }));
        expect(blocksOf(1)).toEqual(["Text"]);
    });

    it("moves, duplicates, drags and deletes blocks and sections", async () => {
        await renderDesigner();
        await userEvent.click(block("Text"));
        expect(button("Drag Text")).toBeInTheDocument();
        await userEvent.click(button("Move up"));
        expect(blocksOf(1)).toEqual(["Text", "Heading", "Button"]);
        expect(button("Move up")).toBeDisabled();
        await userEvent.click(button("Move down"));
        expect(blocksOf(1)).toEqual(["Heading", "Text", "Button"]);
        await userEvent.click(button("Duplicate"));
        expect(blocksOf(1)).toEqual(["Heading", "Text", "Text", "Button"]);
        await userEvent.click(button("Delete block"));
        expect(blocksOf(1)).toEqual(["Heading", "Text", "Button"]);
        expect(settings().getByRole("heading", { name: "Theme" })).toBeInTheDocument();

        act(() => dnd.onDragEnd!({ active: { id: "b-btn" }, over: { id: "b-head" } }));
        expect(blocksOf(1)).toEqual(["Button", "Heading", "Text"]);
        act(() => dnd.onDragEnd!({ active: { id: "b-btn" }, over: { id: "c2" } }));
        expect(blocksOf(2)).toEqual(["Footer", "Button"]);
        act(() => dnd.onDragEnd!({ active: { id: "b-btn" }, over: null }));
        act(() => dnd.onDragEnd!({ active: { id: "b-btn" }, over: { id: "b-btn" } }));
        expect(blocksOf(2)).toEqual(["Footer", "Button"]);

        fireEvent.keyDown(screen.getByRole("group", { name: "Section 2" }), { key: "Enter" });
        expect(settings().getByRole("heading", { name: "Section" })).toBeInTheDocument();
        await userEvent.click(button("Move section up"));
        expect(blocksOf(1)).toEqual(["Footer", "Button"]);
        expect(button("Move section up")).toBeDisabled();
        await userEvent.click(button("Move section down"));
        expect(blocksOf(2)).toEqual(["Footer", "Button"]);
        await userEvent.click(button("Delete section"));
        expect(screen.getAllByRole("group", { name: /^Section / })).toHaveLength(1);

        fireEvent.keyDown(block("Heading"), { key: " " });
        expect(settings().getByRole("heading", { name: "Heading" })).toBeInTheDocument();
        fireEvent.keyDown(block("Heading"), { key: "a" });
        await userEvent.click(screen.getByLabelText("Template name").closest("div.flex-col")!.querySelector(".py-8")!);
        expect(settings().getByRole("heading", { name: "Theme" })).toBeInTheDocument();
    });

    it("edits every kind of block in the inspector", async () => {
        const template = emailTemplate();
        template.design.sections[0].columns[0].blocks = [
            { id: "h", type: "heading", text: "Hello", level: 1 },
            { id: "t", type: "text", html: "<p>Body</p>" },
            { id: "i", type: "image", src: "", alt: "" },
            { id: "b", type: "button", text: "Go", href: "https://x" },
            { id: "d", type: "divider" },
            { id: "sp", type: "spacer", height: 10 },
            { id: "so", type: "social", links: [{ network: "web", href: "https://acme.example" }] },
            { id: "x", type: "html", html: "<p>Raw</p>" },
            { id: "f", type: "footer" },
        ];
        await renderDesigner("owner", template);
        const s = settings;

        await userEvent.click(block("Heading"));
        await userEvent.clear(s().getByLabelText("Heading"));
        await userEvent.type(s().getByLabelText("Heading"), "Welcome");
        await userEvent.selectOptions(s().getByLabelText("Insert merge tag into heading"), "contact.first_name");
        await userEvent.selectOptions(s().getByLabelText("Size"), "3");
        fireEvent.change(s().getByLabelText("Colour"), { target: { value: "#ff0000" } });
        await userEvent.click(s().getByRole("button", { name: "Default" }));
        await userEvent.selectOptions(s().getByLabelText("Alignment"), "center");
        await userEvent.selectOptions(s().getByLabelText("Alignment"), "");
        await userEvent.type(s().getByLabelText("Padding (px)"), "500");
        expect(s().getByLabelText("Padding (px)")).toHaveValue(500);
        fireEvent.blur(s().getByLabelText("Padding (px)"));
        expect(s().getByLabelText("Padding (px)")).toHaveValue(50);
        await userEvent.type(s().getByLabelText("Padding (px)"), ".5");
        await userEvent.clear(s().getByLabelText("Padding (px)"));
        expect(screen.getByRole("heading", { name: "Welcome{{ contact.first_name }}", level: 3 })).toBeInTheDocument();

        await userEvent.click(block("Text"));
        expect(s().getByText("Edit the text on the canvas.")).toBeInTheDocument();
        await userEvent.type(s().getByLabelText("Font size (px)"), "20");
        fireEvent.change(s().getByLabelText("Text colour"), { target: { value: "#00ff00" } });
        await userEvent.type(screen.getByLabelText("Text editor"), "!");

        await userEvent.click(block("Image"));
        await userEvent.type(s().getByLabelText("Image address (https://)"), "https://acme.example/logo.png");
        await userEvent.type(s().getByLabelText("Description (alt text)"), "Acme");
        await userEvent.type(s().getByLabelText("Link (optional)"), "https://acme.example");
        await userEvent.clear(s().getByLabelText("Link (optional)"));
        await userEvent.type(s().getByLabelText("Width (px)"), "200");
        expect(screen.getByRole("img", { name: "Acme" })).toHaveStyle({ width: "200px" });

        await userEvent.click(block("Button"));
        await userEvent.type(s().getByLabelText("Label"), "!");
        await userEvent.selectOptions(s().getByLabelText("Insert merge tag into link"), "links.unsubscribe");
        fireEvent.change(s().getByLabelText("Button colour"), { target: { value: "#000000" } });
        fireEvent.change(s().getByLabelText("Label colour"), { target: { value: "#fefefe" } });
        await userEvent.type(s().getByLabelText("Corner radius (px)"), "8");
        expect(s().getByLabelText("Link")).toHaveValue("https://x{{ links.unsubscribe }}");

        await userEvent.click(block("Divider"));
        fireEvent.change(s().getByLabelText("Colour"), { target: { value: "#cccccc" } });
        await userEvent.type(s().getByLabelText("Thickness (px)"), "3");
        expect(s().queryByLabelText("Alignment")).not.toBeInTheDocument();

        await userEvent.click(block("Spacer"));
        await userEvent.clear(s().getByLabelText("Height (px)"));
        fireEvent.blur(s().getByLabelText("Height (px)"));
        expect(s().getByLabelText("Height (px)")).toHaveValue(24);
        expect(s().queryByLabelText("Padding (px)")).not.toBeInTheDocument();

        await userEvent.click(block("Social links"));
        await userEvent.click(s().getByRole("button", { name: "+ Add link" }));
        await userEvent.selectOptions(s().getByLabelText("Network 2"), "github");
        await userEvent.type(s().getByLabelText("Address 2"), "https://github.com/acme");
        await userEvent.click(s().getByRole("button", { name: "Remove link 1" }));
        expect(s().getByLabelText("Network 1")).toHaveValue("github");
        expect(s().getByRole("button", { name: "Remove link 1" })).toBeDisabled();
        for (let count = 1; count < 10; count++) {
            await userEvent.click(s().getByRole("button", { name: "+ Add link" }));
        }
        expect(s().queryByRole("button", { name: "+ Add link" })).not.toBeInTheDocument();
        for (let count = 1; count < 10; count++) {
            await userEvent.click(s().getByRole("button", { name: "Remove link 2" }));
        }

        await userEvent.click(block("HTML"));
        fireEvent.change(s().getByLabelText("HTML"), { target: { value: "<b>New</b>" } });
        expect(block("HTML")).toHaveTextContent("<b>New</b>");

        await userEvent.click(screen.getAllByRole("group", { name: "Footer block" })[0]);
        await userEvent.type(s().getByLabelText("Note (why they get this email)"), "Hi");
        await userEvent.clear(s().getByLabelText("Note (why they get this email)"));
        fireEvent.change(s().getByLabelText("Text colour"), { target: { value: "#999999" } });

        await userEvent.click(screen.getByRole("group", { name: "Section 1" }));
        await userEvent.selectOptions(s().getByLabelText("Columns"), "2");
        fireEvent.change(s().getByLabelText("Background"), { target: { value: "#fafafa" } });
        await userEvent.clear(s().getByLabelText("Padding (px)"));
        await userEvent.type(s().getByLabelText("Padding (px)"), "0");
        expect(within(screen.getByRole("group", { name: "Section 1" })).getByText("Empty column")).toBeInTheDocument();

        await userEvent.click(button("Theme"));
        await userEvent.selectOptions(s().getByLabelText("Font"), "Georgia, 'Times New Roman', serif");
        await userEvent.clear(s().getByLabelText("Width (px)"));
        fireEvent.blur(s().getByLabelText("Width (px)"));
        expect(s().getByLabelText("Width (px)")).toHaveValue(600);
        fireEvent.change(s().getByLabelText("Page background"), { target: { value: "#000000" } });
        expect(s().queryByRole("button", { name: "Default" })).not.toBeInTheDocument();

        api.updateTemplate.mockImplementation(async (_w: string, _u: string, input: any) => emailTemplate({ ...input, version: 1 }));
        await userEvent.click(button("Save"));
        const saved = api.updateTemplate.mock.lastCall[2];
        expect(saved.design.theme).toMatchObject({ fontFamily: "Georgia, 'Times New Roman', serif", width: 600, backgroundColor: "#000000" });
        const blocks = saved.design.sections[0].columns[0].blocks;
        expect(blocks[0]).toMatchObject({ text: "Welcome{{ contact.first_name }}", level: 3, color: undefined, align: undefined, padding: undefined });
        expect(blocks[1]).toMatchObject({ html: "<p>Body</p>!", fontSize: 20, color: "#00ff00" });
        expect(blocks[2]).toMatchObject({ src: "https://acme.example/logo.png", alt: "Acme", href: undefined, width: 200 });
        expect(blocks[3]).toMatchObject({ text: "Go!", backgroundColor: "#000000", color: "#fefefe", borderRadius: 8 });
        expect(blocks[4]).toMatchObject({ color: "#cccccc", thickness: 3 });
        expect(blocks[5]).toMatchObject({ height: 24 });
        expect(blocks[6].links).toHaveLength(1);
        expect(blocks[6].links[0]).toEqual({ network: "github", href: "https://github.com/acme" });
        expect(blocks[7]).toMatchObject({ html: "<b>New</b>" });
        expect(blocks[8]).toMatchObject({ note: undefined, color: "#999999" });
        expect(saved.design.sections[0]).toMatchObject({ backgroundColor: "#fafafa", padding: 0 });
    }, 30_000);

    it("lets only admins write HTML", async () => {
        const template = emailTemplate();
        template.design.sections[0].columns[0].blocks.push({ id: "x", type: "html", html: "<p>Raw</p>" });
        api.listSavedBlocks.mockResolvedValue([{ uid: "sb1", name: "Snippet", blocks: [{ id: "q", type: "html", html: "<i>x</i>" }] }]);
        await renderDesigner("editor", template);
        const palette = within(screen.getByRole("complementary", { name: "Blocks" }));
        expect(palette.queryByRole("button", { name: "HTML" })).not.toBeInTheDocument();
        expect(palette.getByRole("button", { name: "Snippet" })).toBeDisabled();
        await userEvent.click(block("HTML"));
        expect(settings().getByText("Only workspace admins can change HTML blocks.")).toBeInTheDocument();
    });

    it("undoes and redoes with the buttons and the keyboard, typing in one place undone at once", async () => {
        await renderDesigner();
        expect(button("Undo")).toBeDisabled();
        await userEvent.click(block("Text"));
        await userEvent.type(screen.getByLabelText("Text editor"), "ab");
        await userEvent.click(button("Delete block"));
        expect(blocksOf(1)).toEqual(["Heading", "Button"]);
        await userEvent.click(button("Undo"));
        expect(blocksOf(1)).toEqual(["Heading", "Text", "Button"]);
        await userEvent.click(button("Undo"));
        expect(block("Text")).toHaveTextContent(/^Body$/);
        expect(button("Undo")).toBeDisabled();
        await userEvent.click(button("Redo"));
        expect(block("Text")).toHaveTextContent("Bodyab");

        fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
        expect(block("Text")).toHaveTextContent(/^Body$/);
        fireEvent.keyDown(document.body, { key: "y", ctrlKey: true });
        expect(block("Text")).toHaveTextContent("Bodyab");
        fireEvent.keyDown(document.body, { key: "z", metaKey: true });
        fireEvent.keyDown(document.body, { key: "Z", ctrlKey: true, shiftKey: true });
        expect(block("Text")).toHaveTextContent("Bodyab");
        // Not for the designer: without Ctrl, another key, or typing in a field.
        fireEvent.keyDown(document.body, { key: "z" });
        fireEvent.keyDown(document.body, { key: "s", ctrlKey: true });
        fireEvent.keyDown(screen.getByLabelText("Template name"), { key: "z", ctrlKey: true });
        expect(block("Text")).toHaveTextContent("Bodyab");
        // The delete is still there to redo.
        expect(button("Redo")).toBeEnabled();
    });

    it("changes the details, warns before leaving unsaved changes, and saves", async () => {
        const listeners = vi.spyOn(window, "addEventListener");
        await renderDesigner();
        expect(button("Saved")).toBeDisabled();
        await userEvent.clear(screen.getByLabelText("Template name"));
        await userEvent.type(screen.getByLabelText("Template name"), "Hello");
        await userEvent.type(screen.getByLabelText("Subject"), "!");
        await userEvent.selectOptions(screen.getByLabelText("Insert merge tag into subject"), "contact.first_name");
        await userEvent.type(screen.getByLabelText("Preview text"), "Read on");
        await userEvent.type(screen.getByLabelText("Category"), "welcome");
        const warn = listeners.mock.calls.find(([type]) => type === "beforeunload")![1] as (event: Event) => void;
        const event = new Event("beforeunload", { cancelable: true });
        warn(event);
        expect(event.defaultPrevented).toBe(true);
        expect(button(/Send test/)).toBeDisabled();

        api.updateTemplate.mockRejectedValueOnce(new ApiRequestError("Changed elsewhere.", 409)).mockResolvedValueOnce(emailTemplate({ name: "Hello", version: 2 }));
        await userEvent.click(button("Save"));
        expect(await screen.findByText("Changed elsewhere.")).toBeInTheDocument();
        await userEvent.click(button("Save"));
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        expect(api.updateTemplate).toHaveBeenLastCalledWith("w1", "t1", {
            name: "Hello",
            subject: "Hi {{ contact.first_name }}!{{ contact.first_name }}",
            preheader: "Read on",
            category: "welcome",
            design: emailTemplate().design,
            version: 0,
        });
        expect(button("Saved")).toBeDisabled();

        await userEvent.clear(screen.getByLabelText("Preview text"));
        await userEvent.clear(screen.getByLabelText("Category"));
        api.updateTemplate.mockResolvedValueOnce(emailTemplate({ hasUnsubscribeLink: false, version: 3 })).mockRejectedValueOnce(new Error("x"));
        await userEvent.click(button("Save"));
        expect(await screen.findByText(/Add a footer or an unsubscribe link/)).toBeInTheDocument();
        expect(api.updateTemplate.mock.lastCall[2]).toMatchObject({ preheader: null, category: null, version: 2 });
        await userEvent.type(screen.getByLabelText("Category"), "x");
        await userEvent.click(button("Save"));
        expect(await screen.findByText("Could not save the template.")).toBeInTheDocument();
    });

    it("won't save a design with a missing link, and selects the block to fix", async () => {
        await renderDesigner();
        await userEvent.click(within(screen.getByRole("complementary", { name: "Blocks" })).getByRole("button", { name: "Image" }));
        await userEvent.click(button("Theme"));
        await userEvent.click(button("Save"));
        expect(screen.getByText("An image needs an https:// address.")).toBeInTheDocument();
        expect(settings().getByRole("heading", { name: "Image" })).toBeInTheDocument();
        expect(api.updateTemplate).not.toHaveBeenCalled();
    });

    it("saves blocks for reuse, inserts them and deletes them", async () => {
        api.listSavedBlocks.mockResolvedValue([{ uid: "sb1", name: "Sign-off", blocks: [{ id: "q", type: "text", html: "<p>Cheers</p>" }] }]);
        api.createSavedBlock.mockRejectedValueOnce(new Error("x")).mockResolvedValue({ uid: "sb2", name: "Big button", blocks: [] });
        api.deleteSavedBlock.mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
        const prompt = vi.spyOn(window, "prompt").mockReturnValueOnce(null).mockReturnValueOnce("  ").mockReturnValue("Big button");
        vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
        await renderDesigner();
        const palette = () => within(screen.getByRole("complementary", { name: "Blocks" }));

        await userEvent.click(palette().getByRole("button", { name: "Sign-off" }));
        expect(screen.getByDisplayValue("<p>Cheers</p>")).toBeInTheDocument();

        await userEvent.click(block("Button"));
        await userEvent.click(button("Save for reuse"));
        await userEvent.click(button("Save for reuse"));
        expect(api.createSavedBlock).not.toHaveBeenCalled();
        expect(prompt).toHaveBeenCalledWith(expect.any(String), "Button");
        await userEvent.click(button("Save for reuse"));
        expect(await screen.findByText("Could not save the block.")).toBeInTheDocument();
        await userEvent.click(button("Save for reuse"));
        expect(await palette().findByRole("button", { name: "Big button" })).toBeInTheDocument();
        expect(api.createSavedBlock).toHaveBeenLastCalledWith("w1", { name: "Big button", blocks: [expect.objectContaining({ id: "b-btn", type: "button" })] });

        await userEvent.click(button("Delete saved block Sign-off"));
        expect(api.deleteSavedBlock).not.toHaveBeenCalled();
        await userEvent.click(button("Delete saved block Sign-off"));
        expect(await screen.findByText("Could not delete the saved block.")).toBeInTheDocument();
        await userEvent.click(button("Delete saved block Sign-off"));
        await waitFor(() => expect(palette().queryByRole("button", { name: "Sign-off" })).not.toBeInTheDocument());
    });

    it("shows no saved blocks yet", async () => {
        await renderDesigner();
        expect(screen.getByText(/to keep it here/)).toBeInTheDocument();
    });

    it("previews the email at each width, as text, and as a contact", async () => {
        api.renderTemplate
            .mockResolvedValueOnce({ subject: "Hi Jane", html: "<p>Jane</p>", text: "Jane text" })
            .mockResolvedValueOnce({ subject: "Hi Ann", html: "<p>Ann</p>", text: "Ann text" })
            .mockRejectedValueOnce(new ApiRequestError("Broken tag.", 400));
        api.searchRecords.mockRejectedValueOnce(new Error("x")).mockResolvedValue({ items: [contact()], total: 1 });
        await renderDesigner();
        await userEvent.click(button("Preview"));
        expect(await screen.findByText("Hi Jane")).toBeInTheDocument();
        expect(api.renderTemplate).toHaveBeenLastCalledWith("w1", { design: emailTemplate().design, subject: "Hi {{ contact.first_name }}", preheader: undefined, contactUid: undefined });
        const frame = screen.getByTitle("Email preview");
        expect(frame).toHaveAttribute("sandbox", "");
        expect(frame).toHaveAttribute("srcdoc", "<p>Jane</p>");
        await userEvent.click(screen.getByRole("radio", { name: "mobile" }));
        expect(frame).toHaveStyle({ width: "375px" });
        await userEvent.click(screen.getByRole("radio", { name: "Plain text" }));
        expect(screen.getByText("Jane text")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("radio", { name: "desktop" }));

        await userEvent.type(screen.getByLabelText("Find a contact"), "ann{Enter}");
        expect(await screen.findByText("Could not search the contacts.")).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText("Find a contact"), "{Enter}");
        await screen.findByRole("option", { name: "ann@acme.example" });
        expect(api.searchRecords).toHaveBeenLastCalledWith("contact", "w1", { q: "ann", limit: 10 });
        await userEvent.selectOptions(screen.getByLabelText("Preview as"), "c1");
        expect(await screen.findByText("Hi Ann")).toBeInTheDocument();
        expect(api.renderTemplate.mock.lastCall[1].contactUid).toBe("c1");
        await userEvent.selectOptions(screen.getByLabelText("Preview as"), "");
        expect(await screen.findByText("Broken tag.")).toBeInTheDocument();
        await userEvent.click(button("Close"));
        expect(screen.queryByTitle("Email preview")).not.toBeInTheDocument();
    });

    it("renders the preview with a preview line, and forgets a render that finishes after it closed", async () => {
        const template = emailTemplate({ preheader: "Peek" });
        let finish: (value: unknown) => void = () => undefined;
        let fail: (error: Error) => void = () => undefined;
        api.renderTemplate
            .mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
            .mockReturnValueOnce(new Promise((_resolve, reject) => (fail = reject)));
        await renderDesigner("owner", template);
        await userEvent.click(button("Preview"));
        expect(api.renderTemplate.mock.lastCall[1].preheader).toBe("Peek");
        await userEvent.click(button("Close"));
        await act(async () => finish({ subject: "late", html: "", text: "" }));
        await userEvent.click(button("Preview"));
        await userEvent.click(button("Close"));
        await act(async () => fail(new Error("late")));
        expect(screen.queryByText("late")).not.toBeInTheDocument();
    });

    it("sends a test of the saved template", async () => {
        api.listSenders.mockResolvedValue([sender, { uid: "s2", fromName: "", fromAddress: "hello@acme.example" }]);
        api.sendTestTemplate.mockRejectedValueOnce(new ApiRequestError("A test can only be sent to the address of a mailbox you can read.", 400)).mockResolvedValue({ sent: "me@acme.example" });
        await renderDesigner();
        await userEvent.click(button(/Send test/));
        await userEvent.type(screen.getByLabelText("To"), "me@acme.example");
        expect(screen.getByRole("option", { name: "hello@acme.example" })).toBeInTheDocument();
        const dialog = within(screen.getByRole("dialog"));
        await userEvent.click(dialog.getByRole("button", { name: "Send test" }));
        expect(await screen.findByText("A test can only be sent to the address of a mailbox you can read.")).toBeInTheDocument();
        expect(api.sendTestTemplate).toHaveBeenLastCalledWith("w1", "t1", { to: "me@acme.example", senderUid: "s1" });
        await userEvent.selectOptions(screen.getByLabelText("From"), "s2");
        await userEvent.click(dialog.getByRole("button", { name: "Send test" }));
        expect(await screen.findByText("Sent to me@acme.example.")).toBeInTheDocument();
        expect(api.sendTestTemplate.mock.lastCall[2].senderUid).toBe("s2");
        await userEvent.click(button("Close"));
    });

    it("asks for a sender before a test can be sent", async () => {
        api.listSenders.mockResolvedValue([]);
        await renderDesigner();
        await userEvent.click(button(/Send test/));
        expect(screen.getByText("Add a sender in the workspace settings first.")).toBeInTheDocument();
    });
});
