/**
 * Layout service (Chapter 8): owns the live document, applies actions (as undoable commands),
 * keeps workspace.toml in two way sync, and renders through the pane pool.
 */
import { parse } from "smol-toml";
import { mount, unmount, type Component } from "svelte";
import { Emitter, toDisposable, type Disposable } from "../kernel/disposable";
import { FanwitError } from "../kernel/errors";
import type { Kernel } from "../kernel/kernel.svelte";
import { TomlFile, type TomlDiagnostic } from "../data/toml-file.svelte";
import { joinPath } from "../host/types";
import { mergePreset, reduce, type LayoutAction, type ReduceContext } from "./actions";
import { clean, locateNode, parentOf, type LayoutDoc, type TabsNode } from "./model";
import { validateLayout } from "./validate";
import { viewTitle, type ViewContribution, type ViewEntry } from "./views";

export interface ActionLogEntry {
	time: number;
	origin: "ui" | "file" | "command" | "cli" | "api" | "undo";
	type: string;
	detail?: string;
	ms: number;
}

export type LayoutInterceptor = (action: LayoutAction, next: (a: LayoutAction) => Promise<void>) => unknown;

export interface CustomNodeType {
	type: string;
	component: (() => Promise<{ default: Component<any> }>) | Component<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
	children?: (node: Record<string, unknown>) => string[];
	drop?: { accepts?: string[]; zones?: string[] };
	actions?: Record<string, (node: Record<string, unknown>) => Record<string, unknown>>;
	owner?: string;
}

export interface Preset {
	id: string;
	title: string;
	description?: string;
	text: string;
	owner?: string;
}

const HEADER = "#:schema ./workspace.schema.json\n# Live layout. Edit and save: the app updates immediately. The app writes here too.\n";

export class LayoutService {
	doc = $state.raw<LayoutDoc>({ version: 1, window: {}, node: {}, pane: {} });
	activeTabset = $state<string | undefined>(undefined);
	activePane = $state<string | undefined>(undefined);
	/** Runtime only: dirty panes and dynamic titles reported by views. */
	dirty = $state<Record<string, boolean>>({});
	titles = $state<Record<string, string>>({});
	diagnostics = $state.raw<TomlDiagnostic[]>([]);
	actionLog = $state<ActionLogEntry[]>([]);
	viewsVersion = $state(0);
	/** Closed panes for tab.reopen. */
	closed: { pane: LayoutDoc["pane"][string]; node?: string }[] = [];
	readonly onDidChange = new Emitter<LayoutDoc>();
	readonly views = new Map<string, ViewEntry>();
	readonly nodeTypes = new Map<string, CustomNodeType>();
	readonly presets = new Map<string, Preset>();
	file: TomlFile | null = null;
	private interceptors: LayoutInterceptor[] = [];
	private defaultText = "";
	readonly pool: PanePool;
	/** Window id this kernel renders (main or an aux layout window). */
	windowId = "main";

	constructor(private k: Kernel) {
		this.pool = new PanePool(k, this);
		k.events.on("fw:layout" as never, (m: { doc: LayoutDoc; from: string }) => {
			if (m.from === k.host.windows.label) return;
			this.setDoc(m.doc, false);
		});
	}

	/** Reduce context for the current window. */
	ctx(): ReduceContext {
		return {
			window: this.windowId,
			activeTabset: this.activeTabset,
			identity: (view, props) => {
				const v = this.views.get(view);
				if (v?.identity) return v.identity(props);
				if (v?.singleton) return view;
				return undefined;
			},
			homeRegion: (view) => this.views.get(view)?.regions?.[0]
		};
	}

	registerView(v: ViewContribution, owner: string): Disposable {
		this.views.set(v.id, { ...v, owner });
		this.viewsVersion++;
		return toDisposable(() => {
			if (this.views.get(v.id)?.owner === owner) this.views.delete(v.id);
			this.viewsVersion++;
		});
	}

	registerNodeType(t: CustomNodeType): Disposable {
		this.nodeTypes.set(t.type, t);
		return toDisposable(() => this.nodeTypes.delete(t.type));
	}

	registerPreset(p: Preset): Disposable {
		this.presets.set(p.id, p);
		return toDisposable(() => this.presets.delete(p.id));
	}

	intercept(fn: LayoutInterceptor): Disposable {
		this.interceptors.push(fn);
		return toDisposable(() => (this.interceptors = this.interceptors.filter((i) => i !== fn)));
	}

	private validate = (v: Record<string, unknown>, text: string) =>
		validateLayout(v, text, { views: new Set(this.views.keys()), nodeTypes: new Set(this.nodeTypes.keys()), file: "workspace.toml" });

	/** Load (or create from the app default) the workspace file in `dir`; null keeps it in memory. */
	async load(dir: string | null, defaultText: string) {
		this.defaultText = defaultText;
		this.file?.dispose();
		this.file = null;
		if (!dir) {
			this.setDoc(parse(defaultText) as unknown as LayoutDoc, false);
			return;
		}
		const file = new TomlFile<LayoutDoc & Record<string, unknown>>(this.k.host, joinPath(dir, "workspace.toml"), {
			template: defaultText.startsWith("#:schema") ? defaultText : HEADER + defaultText.replace(/^#:schema[^\n]*\n/, ""),
			validate: this.validate
		});
		this.file = file;
		await file.load();
		this.diagnostics = file.diagnostics;
		if (file.diagnostics.some((d) => d.severity === "error")) {
			// keep running on the app default; the broken file stays untouched until fixed
			this.setDoc(parse(defaultText) as unknown as LayoutDoc, false);
		} else this.setDoc(file.value as LayoutDoc, false);
		file.onDidChangeFromDisk.on((v) => {
			const t0 = performance.now();
			this.setDoc(v as LayoutDoc, false);
			this.log({ origin: "file", type: "reload", ms: performance.now() - t0, detail: "workspace.toml" });
			this.broadcast();
		});
		await file.watch();
		$effect.root(() => {
			$effect(() => {
				this.diagnostics = file.diagnostics;
			});
		});
	}

	private setDoc(d: LayoutDoc, persist: boolean) {
		this.doc = d;
		if (this.activeTabset && !d.node[this.activeTabset]) this.activeTabset = undefined;
		if (this.activePane && !d.pane[this.activePane]) this.activePane = undefined;
		this.pool.sweep(d);
		if (persist) this.file?.set(clean(d) as LayoutDoc & Record<string, unknown>);
		this.k.context.set("layout.maximized", !!d.window[this.windowId]?.maximized);
		this.k.context.set("layout.zen", !!d.window[this.windowId]?.zen);
		this.onDidChange.fire(d);
	}

	private broadcast() {
		this.k.events.emit("fw:layout" as never, { doc: this.doc, from: this.k.host.windows.label } as never, { scope: "app" });
	}

	private log(e: Omit<ActionLogEntry, "time">) {
		this.actionLog = [{ ...e, ms: Math.round(e.ms * 10) / 10, time: Date.now() }, ...this.actionLog].slice(0, 200);
	}

	/** Apply an action: interceptors, reducer, history, persistence and broadcast. */
	async dispatch(action: LayoutAction, o: { origin?: ActionLogEntry["origin"]; undoable?: boolean } = {}): Promise<string | undefined> {
		let focus: string | undefined;
		const run = async (a: LayoutAction) => {
			const t0 = performance.now();
			const before = this.doc;
			const r = reduce(before, a, this.ctx());
			if (a.type === "closePane") {
				const p = parentOf(before, a.pane);
				this.closed.push({ pane: before.pane[a.pane], node: p?.parent });
				if (this.closed.length > 30) this.closed.shift();
			}
			this.setDoc(r.doc, true);
			this.broadcast();
			focus = r.focus;
			if (r.focus) this.focusPane(r.focus);
			if (o.undoable !== false && a.type !== "setSizes" && a.type !== "setFloat") {
				const after = r.doc;
				this.k.history.push({
					label: `Layout: ${a.type}`,
					undo: () => {
						this.setDoc(before, true);
						this.broadcast();
					},
					redo: () => {
						this.setDoc(after, true);
						this.broadcast();
					}
				});
			}
			this.log({ origin: o.origin ?? "ui", type: a.type, ms: performance.now() - t0, detail: describe(a) });
		};
		const chain = (i: number) => async (a: LayoutAction) => {
			if (i >= this.interceptors.length) return run(a);
			await this.interceptors[i](a, chain(i + 1));
		};
		await chain(0)(action);
		return focus;
	}

	/** Open a view by id and props (Section 8.9). */
	openView(view: string, props?: Record<string, unknown>, o: { target?: string; preview?: boolean; title?: string } = {}) {
		if (!this.views.has(view)) {
			throw new FanwitError("VIEW_UNKNOWN", { message: `Unknown view "${view}".`, hint: "Register it in a module's contributes.views.", docs: "manual://layout#views" });
		}
		return this.dispatch({ type: "openView", view, props, ...o });
	}

	focusPane(pane: string) {
		const p = parentOf(this.doc, pane);
		this.activePane = pane;
		if (p) this.activeTabset = p.parent;
		this.k.context.set("activeTab", this.doc.pane[pane]?.view);
		this.k.context.set("focusedView", this.doc.pane[pane]?.view);
		const props = this.doc.pane[pane]?.props ?? {};
		const path = typeof props.path === "string" ? props.path : undefined;
		this.k.context.set("resource.path", path);
		this.k.context.set("resource.ext", path?.split(".").pop()?.toLowerCase());
		this.k.context.set("activeRegion", p ? locateNode(this.doc, p.parent)?.region : undefined);
		void this.k.modules.fire(`onView:${this.doc.pane[pane]?.view}`);
	}

	paneTitle(id: string): string {
		const p = this.doc.pane[id];
		if (!p) return id;
		return this.titles[id] ?? p.title ?? viewTitle(this.views.get(p.view), p.props ?? {}, p.view);
	}

	/** Replace the workspace with a preset, keeping document panes whose identity still exists. */
	async applyPreset(id: string) {
		const p = this.presets.get(id);
		if (!p) throw new FanwitError("PRESET_UNKNOWN", { message: `Unknown layout preset "${id}".`, hint: `Available: ${[...this.presets.keys()].join(", ")}` });
		const preset = parse(p.text) as unknown as LayoutDoc;
		preset.preset = id;
		await this.dispatch({ type: "replace", doc: mergePreset(preset, this.doc, this.ctx().identity), reason: `preset ${id}` });
	}

	async reset() {
		await this.dispatch({ type: "replace", doc: parse(this.defaultText) as unknown as LayoutDoc, reason: "reset" });
	}

	async reopenClosed() {
		const last = this.closed.pop();
		if (!last) return;
		const target = last.node && this.doc.node[last.node]?.type === "tabs" ? last.node : undefined;
		await this.dispatch({ type: "openView", view: last.pane.view, props: last.pane.props, target, title: last.pane.title });
	}

	/** The tab set containing the active pane, or the first tab set of the main region. */
	activeTabsNode(): TabsNode | undefined {
		return this.activeTabset ? (this.doc.node[this.activeTabset] as TabsNode) : undefined;
	}

	async saveWorkspace(name: string, dir: string) {
		await this.k.host.fs.writeToml(joinPath(dir, "workspaces", `${name}.toml`), clean(this.doc) as unknown as Record<string, unknown>);
	}

	async loadWorkspace(name: string, dir: string) {
		const text = await this.k.host.fs.readText(joinPath(dir, "workspaces", `${name}.toml`));
		const v = parse(text);
		const diags = this.validate(v, text);
		if (diags.some((d) => d.severity === "error")) throw new FanwitError("LAYOUT_INVALID", { message: `Workspace "${name}" is invalid: ${diags[0].message}` });
		await this.dispatch({ type: "replace", doc: v as unknown as LayoutDoc, reason: `workspace ${name}` });
	}

	/** Flush pending writes (window blur, vault switch, shutdown). */
	async flush() {
		await this.file?.flush();
	}

	/** TOML text of the current document (Layout Lab, Copy as TOML). */
	toToml(): string {
		return this.file?.text ?? "";
	}
}

function describe(a: LayoutAction): string {
	const parts = Object.entries(a)
		.filter(([k, v]) => k !== "type" && k !== "doc" && v !== undefined)
		.map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`);
	return parts.join(" ").slice(0, 120);
}

/**
 * Pane pool (Section 8.7.3): each pane's view lives in its own host element keyed by pane id.
 * Layout slots adopt host elements instead of creating views, so moving a pane never remounts
 * it and component state, focus and scroll survive.
 */
export class PanePool {
	private hosts = new Map<string, { el: HTMLElement; app: Record<string, unknown> }>();
	/** Component used to host a view (boundary, loading and error states). Set by the workbench. */
	hostComponent: Component<{ paneId: string }> | null = null;

	constructor(
		private k: Kernel,
		private layout: LayoutService
	) {}

	element(paneId: string): HTMLElement {
		let h = this.hosts.get(paneId);
		if (!h) {
			const el = document.createElement("div");
			el.className = "fw-pane-host";
			el.dataset.pane = paneId;
			el.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden";
			if (!this.hostComponent) throw new Error("PanePool.hostComponent is not set");
			const app = mount(this.hostComponent, { target: el, props: { paneId }, context: new Map([["fanwit", this.k]]) });
			h = { el, app };
			this.hosts.set(paneId, h);
		}
		return h.el;
	}

	/** Unmount views whose panes left the document. */
	sweep(doc: LayoutDoc) {
		for (const [id, h] of this.hosts) {
			if (doc.pane[id]) continue;
			void unmount(h.app);
			h.el.remove();
			this.hosts.delete(id);
		}
	}

	has(id: string) {
		return this.hosts.has(id);
	}
}

/** Svelte action: adopt a pane's host element into this slot. */
export function adoptPane(node: HTMLElement, a: { pool: PanePool; pane: string }) {
	let cur = a.pane;
	node.appendChild(a.pool.element(cur));
	return {
		update(n: { pool: PanePool; pane: string }) {
			if (n.pane === cur) return;
			cur = n.pane;
			node.replaceChildren(n.pool.element(cur));
		}
	};
}
