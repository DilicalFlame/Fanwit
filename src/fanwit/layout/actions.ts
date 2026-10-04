/**
 * Layout actions (Section 8.9): every mutation is a pure reducer over a cloned document. The
 * layout service wraps each in a command (undoable, interceptable, scriptable).
 */
import { FanwitError } from "../kernel/errors";
import {
	allTabsets,
	locateNode,
	newId,
	nodePanes,
	parentOf,
	type FloatModel,
	type LayoutDoc,
	type LayoutNode,
	type NodeRegion,
	type RegionName,
	type SplitNode,
	type TabsNode
} from "./model";

export type Side = "left" | "right" | "top" | "bottom";
export type MoveTarget = { node: string; index?: number } | { edge: string; side: Side } | { region: NodeRegion } | { float: [number, number, number, number] };

export type LayoutAction =
	| { type: "openView"; view: string; props?: Record<string, unknown>; target?: string; preview?: boolean; title?: string; icon?: string; identity?: string; paneId?: string }
	| { type: "closePane"; pane: string }
	| { type: "closeOthers"; pane: string }
	| { type: "movePane"; pane: string; to: MoveTarget }
	| { type: "reorder"; node: string; pane: string; index: number }
	| { type: "split"; node?: string; dir: "row" | "column"; pane?: string; move?: boolean; side?: Side }
	| { type: "setSizes"; node: string; sizes: (number | string)[] }
	| { type: "selectPane"; pane: string }
	| { type: "maximize"; node?: string; window?: string }
	| { type: "restore"; window?: string }
	| { type: "toggleRegion"; region: RegionName; visible?: boolean; window?: string }
	| { type: "setRegion"; region: RegionName; attrs: Record<string, unknown>; window?: string }
	| { type: "float"; pane: string; rect?: [number, number, number, number] }
	| { type: "dock"; float: string; node?: string }
	| { type: "setFloat"; float: string; attrs: Partial<FloatModel> }
	| { type: "popOut"; pane: string; windowId?: string }
	| { type: "popIn"; window: string }
	| { type: "openDrawer"; view?: string; pane?: string; props?: Record<string, unknown>; side?: Side; size?: string | number; modal?: boolean; id?: string }
	| { type: "closeDrawer"; drawer: string }
	| { type: "openOverlay"; view: string; props?: Record<string, unknown>; variant?: "dialog" | "fullscreen" | "sheet" | "lightbox"; backdrop?: "dim" | "blur" | "none"; id?: string }
	| { type: "closeOverlay"; overlay: string }
	| { type: "setAttrs"; table: "node" | "pane" | "window" | "float"; id: string; attrs: Record<string, unknown> }
	| { type: "replace"; doc: LayoutDoc; reason?: string };

export interface ReduceContext {
	/** Window this kernel runs in. */
	window: string;
	/** Focused tab set (runtime state, not persisted). */
	activeTabset?: string;
	/** Identity of a view instance: same view + identity -> reuse the pane. */
	identity?: (view: string, props: Record<string, unknown>) => string | undefined;
	/** Default region for a view that has no target. */
	homeRegion?: (view: string) => string | undefined;
}

export interface ReduceResult {
	doc: LayoutDoc;
	/** Pane to focus after the action. */
	focus?: string;
}

const fail = (message: string) => new FanwitError("LAYOUT_ACTION", { message, docs: "manual://layout#actions" });

function tabs(doc: LayoutDoc, id: string): TabsNode {
	const n = doc.node[id];
	if (!n || (n.type !== "tabs" && n.type !== "stack" && n.type !== "grid")) throw fail(`"${id}" is not a tab set.`);
	return n as TabsNode;
}

function mainTabset(doc: LayoutDoc, win: string): string {
	const w = doc.window[win] ?? doc.window.main;
	let id = w?.regions?.main?.node ?? w?.root;
	for (let guard = 0; id && guard < 50; guard++) {
		const n = doc.node[id];
		if (!n) break;
		if (n.type !== "split") return id;
		id = (n as SplitNode).children[0];
	}
	const any = allTabsets(doc, win)[0];
	if (any) return any;
	throw fail("This window has no tab set to open views in.");
}

function regionNode(doc: LayoutDoc, win: string, region: string): string | null {
	const st = doc.window[win]?.regions?.[region as RegionName];
	if (!st?.node) return null;
	let id: string = st.node;
	for (let guard = 0; guard < 50; guard++) {
		const n = doc.node[id];
		if (!n || n.type !== "split") return id;
		id = (n as SplitNode).children[0];
	}
	return id;
}

/** Remove a pane id from wherever it is listed, fixing the tab set's active pane. */
function detach(doc: LayoutDoc, pane: string): string | null {
	const p = parentOf(doc, pane);
	if (!p) {
		for (const t of ["float", "drawer", "overlay"] as const) for (const [id, f] of Object.entries(doc[t] ?? {})) if (f.pane === pane) delete doc[t]![id];
		return null;
	}
	const n = doc.node[p.parent] as TabsNode;
	n.panes.splice(p.index, 1);
	if (n.active === pane) n.active = n.panes[Math.min(p.index, n.panes.length - 1)];
	return p.parent;
}

/** Collapse empty tab sets and single child splits, except region roots. */
function tidy(doc: LayoutDoc) {
	const protectedIds = new Set<string>();
	for (const w of Object.values(doc.window)) {
		if (w.root) protectedIds.add(w.root);
		for (const st of Object.values(w.regions ?? {})) {
			if (st?.node) protectedIds.add(st.node);
			st?.containers?.forEach((c) => protectedIds.add(c));
		}
	}
	for (let changed = true, guard = 0; changed && guard < 50; guard++) {
		changed = false;
		for (const [id, n] of Object.entries(doc.node)) {
			if (protectedIds.has(id)) continue;
			const parent = parentOf(doc, id);
			if (n.type === "tabs" && (n as TabsNode).panes.length === 0 && parent) {
				const s = doc.node[parent.parent] as SplitNode;
				s.children.splice(parent.index, 1);
				s.sizes?.splice(parent.index, 1);
				delete doc.node[id];
				changed = true;
			} else if (n.type === "split" && (n as SplitNode).children.length === 1 && parent) {
				const s = doc.node[parent.parent] as SplitNode;
				s.children[parent.index] = (n as SplitNode).children[0];
				delete doc.node[id];
				changed = true;
			} else if (n.type === "split" && (n as SplitNode).children.length === 0 && parent) {
				const s = doc.node[parent.parent] as SplitNode;
				s.children.splice(parent.index, 1);
				s.sizes?.splice(parent.index, 1);
				delete doc.node[id];
				changed = true;
			}
		}
	}
	// a split that only holds one child becomes that child when it is a window or region root
	for (const w of Object.values(doc.window)) {
		const root = w.root ? doc.node[w.root] : null;
		if (root?.type === "split" && (root as SplitNode).children.length === 1) {
			const child = (root as SplitNode).children[0];
			delete doc.node[w.root!];
			w.root = child;
		}
		for (const st of Object.values(w.regions ?? {})) {
			const n = st?.node ? doc.node[st.node] : null;
			if (n?.type === "split" && (n as SplitNode).children.length === 1) {
				const child = (n as SplitNode).children[0];
				delete doc.node[st!.node!];
				st!.node = child;
			}
		}
	}
	// normalise weights
	for (const n of Object.values(doc.node)) {
		if (n.type !== "split") continue;
		const s = n as SplitNode;
		if (s.sizes && s.sizes.length !== s.children.length) s.sizes = undefined;
	}
}

/** Insert node `fresh` beside `target` on `side`, creating a split when the direction differs. */
function insertBeside(doc: LayoutDoc, target: string, fresh: string, side: Side) {
	const dir: "row" | "column" = side === "left" || side === "right" ? "row" : "column";
	const after = side === "right" || side === "bottom";
	const p = parentOf(doc, target);
	const parentSplit = p ? (doc.node[p.parent] as SplitNode) : null;
	if (parentSplit && parentSplit.type === "split" && parentSplit.dir === dir) {
		const at = p!.index + (after ? 1 : 0);
		parentSplit.children.splice(at, 0, fresh);
		if (parentSplit.sizes) {
			const share = typeof parentSplit.sizes[p!.index] === "number" ? (parentSplit.sizes[p!.index] as number) / 2 : 0.5;
			if (typeof parentSplit.sizes[p!.index] === "number") parentSplit.sizes[p!.index] = share;
			parentSplit.sizes.splice(at, 0, share);
		}
		return;
	}
	// wrap target in a new split
	const splitId = newId(doc, "split");
	doc.node[splitId] = { type: "split", dir, children: after ? [target, fresh] : [fresh, target], sizes: [0.5, 0.5] };
	if (p) {
		(doc.node[p.parent] as SplitNode).children[p.index] = splitId;
	} else {
		for (const w of Object.values(doc.window)) {
			if (w.root === target) w.root = splitId;
			for (const st of Object.values(w.regions ?? {})) if (st?.node === target) st.node = splitId;
		}
	}
}

export function reduce(input: LayoutDoc, a: LayoutAction, ctx: ReduceContext): ReduceResult {
	const doc: LayoutDoc = structuredClone(input);
	const win = ctx.window;
	const active = ctx.activeTabset && doc.node[ctx.activeTabset] ? ctx.activeTabset : undefined;
	let focus: string | undefined;

	switch (a.type) {
		case "openView": {
			const props = a.props ?? {};
			const identity = a.identity ?? ctx.identity?.(a.view, props);
			// reuse an existing pane with the same identity
			const existing = Object.entries(doc.pane).find(([, p]) => p.view === a.view && (identity === undefined ? !a.props : ctx.identity?.(p.view, p.props ?? {}) === identity));
			if (existing && (identity !== undefined || !a.props)) {
				const [pid, p] = existing;
				if (!a.preview && p.preview) p.preview = undefined;
				const parent = parentOf(doc, pid);
				if (parent && doc.node[parent.parent].type === "tabs") (doc.node[parent.parent] as TabsNode).active = pid;
				for (const d of Object.values(doc.drawer ?? {})) if (d.pane === pid) d.open = true;
				const loc = parent ? locateNode(doc, parent.parent) : null;
				if (loc?.region) {
					const st = doc.window[loc.window].regions![loc.region]!;
					st.visible = true;
				}
				return { doc, focus: pid };
			}
			const pid = a.paneId && !doc.pane[a.paneId] ? a.paneId : newId(doc, a.view.split(".").pop()!.replace(/[^\w-]/g, "") || "pane");
			doc.pane[pid] = { view: a.view, props: a.props, title: a.title, icon: a.icon, preview: a.preview || undefined };
			const target = a.target ?? ctx.homeRegion?.(a.view) ?? "active";
			if (target === "float") {
				doc.float ??= {};
				doc.float[newId(doc, "float")] = { window: win, pane: pid, rect: [-340, 48, 320, 380] };
				return { doc, focus: pid };
			}
			let ts: string;
			if (target === "active") ts = active && doc.node[active]?.type === "tabs" && locateNode(doc, active)?.region === "main" ? active : mainTabset(doc, win);
			else if (target === "beside") {
				const base = active ?? mainTabset(doc, win);
				ts = newId(doc, "tabs");
				doc.node[ts] = { type: "tabs", panes: [] };
				insertBeside(doc, base, ts, "right");
			} else if (doc.node[target]) ts = target;
			else {
				const r = regionNode(doc, win, target);
				if (!r) throw fail(`Unknown target "${target}". Use active, beside, float, a region or a node id.`);
				ts = r;
				const st = doc.window[win].regions![target as RegionName]!;
				st.visible = true;
			}
			const t = tabs(doc, ts);
			if (a.preview) {
				const old = t.panes.find((p) => doc.pane[p]?.preview);
				if (old) {
					t.panes[t.panes.indexOf(old)] = pid;
					delete doc.pane[old];
				} else t.panes.splice(t.active ? t.panes.indexOf(t.active) + 1 : t.panes.length, 0, pid);
			} else t.panes.splice(t.active && t.panes.includes(t.active) ? t.panes.indexOf(t.active) + 1 : t.panes.length, 0, pid);
			t.active = pid;
			focus = pid;
			break;
		}
		case "closePane": {
			if (!doc.pane[a.pane]) throw fail(`No pane "${a.pane}".`);
			const from = detach(doc, a.pane);
			delete doc.pane[a.pane];
			if (from) {
				const t = doc.node[from] as TabsNode;
				focus = t.active;
			}
			tidy(doc);
			break;
		}
		case "closeOthers": {
			const p = parentOf(doc, a.pane);
			if (!p) break;
			const t = doc.node[p.parent] as TabsNode;
			for (const other of t.panes.filter((x) => x !== a.pane && !doc.pane[x]?.pinned)) {
				delete doc.pane[other];
			}
			t.panes = t.panes.filter((x) => doc.pane[x]);
			t.active = a.pane;
			break;
		}
		case "movePane": {
			if (!doc.pane[a.pane]) throw fail(`No pane "${a.pane}".`);
			const to = a.to;
			if ("float" in to) {
				const origin = parentOf(doc, a.pane)?.parent;
				detach(doc, a.pane);
				doc.float ??= {};
				doc.float[newId(doc, "float")] = { window: win, pane: a.pane, rect: to.float, origin };
				tidy(doc);
				return { doc, focus: a.pane };
			}
			if ("node" in to) {
				const t = tabs(doc, to.node);
				const sameParent = parentOf(doc, a.pane)?.parent === to.node;
				const oldIndex = t.panes.indexOf(a.pane);
				detach(doc, a.pane);
				let idx = to.index ?? t.panes.length;
				if (sameParent && oldIndex >= 0 && oldIndex < idx) idx--;
				t.panes.splice(Math.max(0, Math.min(idx, t.panes.length)), 0, a.pane);
				t.active = a.pane;
			} else if ("edge" in to) {
				if (!doc.node[to.edge]) throw fail(`No node "${to.edge}".`);
				detach(doc, a.pane);
				const fresh = newId(doc, "tabs");
				doc.node[fresh] = { type: "tabs", panes: [a.pane], active: a.pane };
				insertBeside(doc, to.edge, fresh, to.side);
			} else {
				const r = regionNode(doc, win, to.region);
				if (!r) throw fail(`Region "${to.region}" has no node.`);
				detach(doc, a.pane);
				const t = tabs(doc, r);
				t.panes.push(a.pane);
				t.active = a.pane;
				doc.window[win].regions![to.region]!.visible = true;
			}
			tidy(doc);
			focus = a.pane;
			break;
		}
		case "reorder": {
			const t = tabs(doc, a.node);
			const i = t.panes.indexOf(a.pane);
			if (i < 0) break;
			t.panes.splice(i, 1);
			t.panes.splice(Math.max(0, Math.min(a.index, t.panes.length)), 0, a.pane);
			break;
		}
		case "split": {
			const base = a.node ?? active ?? mainTabset(doc, win);
			const t = tabs(doc, base);
			const pane = a.pane ?? t.active;
			const fresh = newId(doc, "tabs");
			let moved: string | undefined;
			if (pane && doc.pane[pane]) {
				if (a.move && t.panes.length > 1) {
					detach(doc, pane);
					moved = pane;
				} else {
					moved = newId(doc, pane.replace(/-\d+$/, ""));
					doc.pane[moved] = structuredClone(doc.pane[pane]);
					delete doc.pane[moved].pinned;
				}
			}
			doc.node[fresh] = { type: "tabs", panes: moved ? [moved] : [], active: moved };
			insertBeside(doc, base, fresh, a.side ?? (a.dir === "row" ? "right" : "bottom"));
			focus = moved;
			break;
		}
		case "setSizes": {
			const n = doc.node[a.node] as SplitNode;
			if (n?.type !== "split") throw fail(`"${a.node}" is not a split.`);
			n.sizes = a.sizes.map((s) => (typeof s === "number" ? Math.round(s * 1000) / 1000 : s));
			break;
		}
		case "selectPane": {
			const p = parentOf(doc, a.pane);
			if (p && doc.node[p.parent].type === "tabs") (doc.node[p.parent] as TabsNode).active = a.pane;
			if (p && doc.node[p.parent].type === "stack") doc.pane[a.pane].collapsed = undefined;
			focus = a.pane;
			break;
		}
		case "maximize": {
			const w = doc.window[a.window ?? win];
			const n = a.node ?? active;
			if (!w || !n) break;
			w.maximized = w.maximized === n ? undefined : n;
			break;
		}
		case "restore": {
			const w = doc.window[a.window ?? win];
			if (w) w.maximized = undefined;
			break;
		}
		case "toggleRegion": {
			const w = doc.window[a.window ?? win];
			if (!w) break;
			w.regions ??= {};
			const st = (w.regions[a.region] ??= {});
			st.visible = a.visible ?? !(st.visible ?? true);
			break;
		}
		case "setRegion": {
			const w = doc.window[a.window ?? win];
			if (!w) break;
			w.regions ??= {};
			w.regions[a.region] = { ...(w.regions[a.region] ?? {}), ...a.attrs };
			break;
		}
		case "float": {
			return reduce(input, { type: "movePane", pane: a.pane, to: { float: a.rect ?? [-340, 48, 320, 380] } }, ctx);
		}
		case "dock": {
			const f = doc.float?.[a.float];
			if (!f) throw fail(`No floating card "${a.float}".`);
			delete doc.float![a.float];
			const target = a.node && doc.node[a.node] ? a.node : f.origin && doc.node[f.origin] ? f.origin : mainTabset(doc, win);
			const t = tabs(doc, target);
			t.panes.push(f.pane);
			t.active = f.pane;
			focus = f.pane;
			break;
		}
		case "setFloat": {
			const f = doc.float?.[a.float];
			if (f) Object.assign(f, a.attrs);
			break;
		}
		case "popOut": {
			if (!doc.pane[a.pane]) throw fail(`No pane "${a.pane}".`);
			const origin = parentOf(doc, a.pane)?.parent;
			detach(doc, a.pane);
			const wid = a.windowId ?? newId(doc, "aux");
			const ts = newId(doc, "tabs");
			doc.node[ts] = { type: "tabs", panes: [a.pane], active: a.pane };
			doc.window[wid] = { kind: "aux", frame: "plain", root: ts, parent: origin ? `node:${origin}` : undefined };
			tidy(doc);
			break;
		}
		case "popIn": {
			const w = doc.window[a.window];
			if (!w || a.window === "main") break;
			const origin = w.parent?.startsWith("node:") ? w.parent.slice(5) : undefined;
			const collect = (id: string | undefined, out: string[] = []): string[] => {
				if (!id) return out;
				if (doc.pane[id]) return [...out, id];
				const n = doc.node[id];
				if (!n) return out;
				if (n.type === "split") (n as SplitNode).children.forEach((c) => collect(c, out));
				else out.push(...nodePanes(n));
				delete doc.node[id];
				return out;
			};
			const panes = collect(w.root ?? w.regions?.main?.node);
			delete doc.window[a.window];
			const target = origin && doc.node[origin] ? origin : mainTabset(doc, "main");
			const t = tabs(doc, target);
			t.panes.push(...panes);
			t.active = panes[0] ?? t.active;
			focus = panes[0];
			break;
		}
		case "openDrawer": {
			let pid = a.pane;
			if (!pid) {
				if (!a.view) throw fail("openDrawer needs a view or a pane.");
				const existing = Object.entries(doc.drawer ?? {}).find(([, d]) => doc.pane[d.pane]?.view === a.view);
				if (existing) {
					existing[1].open = true;
					return { doc, focus: existing[1].pane };
				}
				pid = newId(doc, a.view.split(".").pop()!);
				doc.pane[pid] = { view: a.view, props: a.props };
			} else detach(doc, pid);
			doc.drawer ??= {};
			doc.drawer[a.id ?? newId(doc, "drawer")] = { window: win, pane: pid, side: a.side ?? "right", size: a.size ?? "360px", open: true, modal: a.modal, mode: "overlay" };
			tidy(doc);
			focus = pid;
			break;
		}
		case "closeDrawer": {
			const d = doc.drawer?.[a.drawer];
			if (d) d.open = false;
			break;
		}
		case "openOverlay": {
			const pid = newId(doc, a.view.split(".").pop()!);
			doc.pane[pid] = { view: a.view, props: a.props };
			doc.overlay ??= {};
			doc.overlay[a.id ?? newId(doc, "overlay")] = { window: win, pane: pid, variant: a.variant ?? "dialog", backdrop: a.backdrop ?? "dim" };
			focus = pid;
			break;
		}
		case "closeOverlay": {
			const o = doc.overlay?.[a.overlay];
			if (!o) break;
			delete doc.pane[o.pane];
			delete doc.overlay![a.overlay];
			break;
		}
		case "setAttrs": {
			const table = (a.table === "float" ? (doc.float ??= {}) : doc[a.table]) as Record<string, object>;
			if (!table[a.id]) throw fail(`No ${a.table} "${a.id}".`);
			for (const [k, v] of Object.entries(a.attrs)) {
				if (v === undefined || v === null) delete (table[a.id] as Record<string, unknown>)[k];
				else (table[a.id] as Record<string, unknown>)[k] = v;
			}
			break;
		}
		case "replace":
			return { doc: structuredClone(a.doc) };
	}
	return { doc, focus };
}

/** Keep panes from `prev` whose identity still exists in a preset (applyPreset keeps open documents). */
export function mergePreset(preset: LayoutDoc, prev: LayoutDoc, identity: ReduceContext["identity"]): LayoutDoc {
	const doc = structuredClone(preset);
	const have = new Set(Object.values(doc.pane).map((p) => `${p.view}|${identity?.(p.view, p.props ?? {}) ?? ""}`));
	const main = (() => {
		try {
			return mainTabset(doc, "main");
		} catch {
			return null;
		}
	})();
	if (!main) return doc;
	for (const [id, p] of Object.entries(prev.pane)) {
		const key = `${p.view}|${identity?.(p.view, p.props ?? {}) ?? ""}`;
		if (have.has(key) || !p.props) continue; // only document-like panes travel
		const pid = doc.pane[id] ? newId(doc, id) : id;
		doc.pane[pid] = p;
		(doc.node[main] as TabsNode).panes.push(pid);
	}
	return doc;
}

export type { LayoutNode };
