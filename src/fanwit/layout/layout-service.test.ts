import { expect, test, vi } from "vitest";
import { createTestKernel } from "../testing";
import { LayoutService } from "./layout.svelte";
import type { TabsNode } from "./model";

const DEFAULT = '[window.main]\nkind = "main"\n[window.main.regions]\nmain = { node = "center" }\n[node.center]\ntype = "tabs"\npanes = []\n';

async function layout(files: Record<string, string> = {}) {
	const k = await createTestKernel({ files });
	const l = new LayoutService(k);
	l.registerView({ id: "notes.editor", title: (p) => String(p.path), component: {} as never, identity: (p) => String(p.path) }, "t");
	l.registerView({ id: "fanwit.welcome", title: "Welcome", component: {} as never, singleton: true }, "t");
	return { k, l };
}

test("actions change the document, write workspace.toml, and undo", async () => {
	const { k, l } = await layout();
	await l.load("/global", DEFAULT);
	expect(await k.host.fs.readText("/global/workspace.toml")).toContain("# Live layout.");
	await l.openView("notes.editor", { path: "a.md" });
	expect((l.doc.node.center as TabsNode).panes).toHaveLength(1);
	await l.flush();
	expect(await k.host.fs.readText("/global/workspace.toml")).toContain('view = "notes.editor"');
	await k.history.undo();
	expect((l.doc.node.center as TabsNode).panes).toHaveLength(0);
});

test("opening a view with the same identity focuses the existing pane", async () => {
	const { l } = await layout();
	await l.load(null, DEFAULT);
	await l.openView("notes.editor", { path: "a.md" });
	await l.openView("notes.editor", { path: "b.md" });
	await l.openView("notes.editor", { path: "a.md" });
	expect((l.doc.node.center as TabsNode).panes).toHaveLength(2);
});

test("an edit to workspace.toml on disk becomes the layout", async () => {
	const { k, l } = await layout();
	await l.load("/global", DEFAULT);
	const text = (await k.host.fs.readText("/global/workspace.toml")).replace("panes = []", 'panes = ["w"]\n[pane.w]\nview = "fanwit.welcome"');
	await k.host.fs.writeText("/global/workspace.toml", text);
	await vi.waitFor(() => expect((l.doc.node.center as TabsNode).panes).toEqual(["w"]));
});

test("a broken workspace.toml keeps the app on its default layout and reports why", async () => {
	const { l } = await layout({ "/global/workspace.toml": '[window.main]\nkind = "main"\n[window.main.regions]\nmain = { node = "missing" }\n' });
	await l.load("/global", DEFAULT);
	expect(l.doc.node.center).toBeDefined();
	expect(l.diagnostics[0]).toMatchObject({ severity: "error", message: expect.stringContaining("missing") });
});

test("interceptors may veto an action", async () => {
	const { l } = await layout();
	await l.load(null, DEFAULT);
	l.intercept((a, next) => (a.type === "openView" && a.view === "fanwit.welcome" ? undefined : next(a)));
	await l.openView("fanwit.welcome");
	await l.openView("notes.editor", { path: "a.md" });
	expect(Object.values(l.doc.pane).map((p) => p.view)).toEqual(["notes.editor"]);
});

test("a preset keeps the files that were open", async () => {
	const { l } = await layout();
	await l.load(null, DEFAULT);
	l.registerPreset({ id: "focus", title: "Focus", text: DEFAULT.replace("panes = []", 'panes = ["w"]\n[pane.w]\nview = "fanwit.welcome"') });
	await l.openView("notes.editor", { path: "a.md" });
	await l.applyPreset("focus");
	expect(Object.values(l.doc.pane).map((p) => p.view).sort()).toEqual(["fanwit.welcome", "notes.editor"]);
	expect(l.doc.preset).toBe("focus");
});
