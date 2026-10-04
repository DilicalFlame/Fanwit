import { parse, stringify } from "smol-toml";
import { expect, test } from "vitest";
import { reduce, type ReduceContext } from "./actions";
import { clean, type LayoutDoc, type SplitNode, type TabsNode } from "./model";
import { validateLayout } from "./validate";

const base = (): LayoutDoc => ({
	version: 1,
	window: { main: { kind: "main", frame: "workbench", regions: { main: { node: "center" }, sidebar: { node: "side", size: "280px" } } } },
	node: { center: { type: "tabs", panes: ["welcome"], active: "welcome" }, side: { type: "stack", panes: ["explorer"] } },
	pane: { welcome: { view: "fanwit.welcome", pinned: true }, explorer: { view: "fanwit.explorer" } }
});
const ctx: ReduceContext = { window: "main", identity: (v, p) => (p.path ? `${v}:${p.path}` : undefined) };

test("openView reuses identity and replaces preview tabs", () => {
	let d = reduce(base(), { type: "openView", view: "notes.editor", props: { path: "a.md" }, preview: true }, ctx).doc;
	d = reduce(d, { type: "openView", view: "notes.editor", props: { path: "b.md" }, preview: true }, ctx).doc;
	const center = d.node.center as TabsNode;
	expect(center.panes.length).toBe(2); // welcome + one preview
	expect(Object.values(d.pane).filter((p) => p.view === "notes.editor").length).toBe(1);
	const r = reduce(d, { type: "openView", view: "notes.editor", props: { path: "b.md" } }, ctx);
	expect(Object.keys(r.doc.pane).length).toBe(Object.keys(d.pane).length);
	expect(r.doc.pane[r.focus!].preview).toBeUndefined();
});

test("moving to an edge splits, closing the last pane collapses the split", () => {
	let d = reduce(base(), { type: "openView", view: "notes.editor", props: { path: "a.md" } }, ctx).doc;
	const pid = Object.keys(d.pane).find((p) => d.pane[p].view === "notes.editor")!;
	d = reduce(d, { type: "movePane", pane: pid, to: { edge: "center", side: "right" } }, ctx).doc;
	const root = d.window.main.regions!.main!.node!;
	expect(d.node[root].type).toBe("split");
	expect((d.node[root] as SplitNode).children.length).toBe(2);
	d = reduce(d, { type: "closePane", pane: pid }, ctx).doc;
	expect(d.window.main.regions!.main!.node).toBe("center");
	expect(validateLayout(d as never)).toEqual([]);
});

test("floats, drawers, pop out and back", () => {
	let d = reduce(base(), { type: "openView", view: "canvas.picker", target: "float" }, ctx).doc;
	expect(Object.keys(d.float!).length).toBe(1);
	const fid = Object.keys(d.float!)[0];
	d = reduce(d, { type: "dock", float: fid }, ctx).doc;
	expect(d.float![fid]).toBeUndefined();
	const pid = (d.node.center as TabsNode).active!;
	d = reduce(d, { type: "popOut", pane: pid }, ctx).doc;
	const aux = Object.keys(d.window).find((w) => w !== "main")!;
	expect(d.window[aux].frame).toBe("plain");
	d = reduce(d, { type: "popIn", window: aux }, ctx).doc;
	expect(d.window[aux]).toBeUndefined();
	expect((d.node.center as TabsNode).panes).toContain(pid);
});

test("splitting a popped out window's only tab leaves a single tab set, not a half empty split", () => {
	const pid = (base().node.center as TabsNode).panes[0];
	let d = reduce(base(), { type: "openView", view: "notes.editor", props: { path: "a.md" } }, ctx).doc;
	const moved = Object.keys(d.pane).find((p) => d.pane[p].view === "notes.editor")!;
	d = reduce(d, { type: "popOut", pane: moved }, ctx).doc;
	const aux = Object.keys(d.window).find((w) => w !== "main")!;
	const auxCtx = { ...ctx, window: aux };
	d = reduce(d, { type: "movePane", pane: moved, to: { edge: d.window[aux].root!, side: "right" } }, auxCtx).doc;
	const root = d.node[d.window[aux].root!] as TabsNode;
	expect(root.type).toBe("tabs");
	expect(root.panes).toEqual([moved]);
	expect((d.node.center as TabsNode).panes).toContain(pid);
	expect(validateLayout(d as never)).toEqual([]);
});

test("moving a pop out window's last tab back into the main window removes that window", () => {
	let d = reduce(base(), { type: "openView", view: "notes.editor", props: { path: "a.md" } }, ctx).doc;
	const pid = Object.keys(d.pane).find((p) => d.pane[p].view === "notes.editor")!;
	d = reduce(d, { type: "popOut", pane: pid }, ctx).doc;
	const aux = Object.keys(d.window).find((w) => w !== "main")!;
	const auxRoot = d.window[aux].root!;
	d = reduce(d, { type: "movePane", pane: pid, to: { node: "center", index: 0 } }, ctx).doc;
	expect(d.window[aux]).toBeUndefined();
	expect(d.node[auxRoot]).toBeUndefined();
	expect((d.node.center as TabsNode).panes[0]).toBe(pid);
	expect(validateLayout(d as never)).toEqual([]);
});

test("validation reports dangling refs, duplicates and cycles with lines", () => {
	const text = `version = 1\n[window.main]\nkind = "main"\n[window.main.regions]\nmain = { node = "a" }\n[node.a]\ntype = "split"\ndir = "row"\nchildren = ["b", "missing"]\n[node.b]\ntype = "split"\ndir = "row"\nchildren = ["a"]\n[node.t1]\ntype = "tabs"\npanes = ["p"]\n[node.t2]\ntype = "tabs"\npanes = ["p"]\n[pane.p]\nview = "nope"\n`;
	const diags = validateLayout(parse(text), text, { views: new Set(["fanwit.welcome"]) });
	const msgs = diags.map((d) => d.message).join("\n");
	expect(msgs).toMatch(/missing node "missing"/);
	expect(msgs).toMatch(/listed in both/);
	expect(msgs).toMatch(/Cycle/);
	expect(msgs).toMatch(/Unknown view "nope"/);
	expect(diags.find((d) => /missing node/.test(d.message))!.line).toBe(6);
});

test("documents round trip through TOML with defaults omitted", () => {
	const d = clean(reduce(base(), { type: "toggleRegion", region: "panel", visible: false }, ctx).doc);
	const back = parse(stringify(d)) as unknown as LayoutDoc;
	expect(back.window.main.regions!.panel!.visible).toBe(false);
	expect(back.pane.welcome.pinned).toBe(true);
});

test("every shipped preset parses and validates", async () => {
	const { readdirSync, readFileSync } = await import("node:fs");
	// every presets/ folder under src, so stripped showcase parts simply drop out
	const files = (readdirSync("src", { recursive: true }) as string[]).map((f) => f.replace(/\\/g, "/")).filter((f) => /(^|\/)presets\/[^/]+\.toml$/.test(f));
	expect(files.length).toBeGreaterThan(0);
	for (const f of files) {
		const text = readFileSync(`src/${f}`, "utf8");
		const errors = validateLayout(parse(text), text).filter((d) => d.severity === "error");
		expect(errors, f).toEqual([]);
	}
});
