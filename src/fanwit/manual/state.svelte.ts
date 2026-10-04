/**
 * The manual's shared state in one window: the docset and kind (Manual or Reference) the
 * navigation shows, the lazily loaded API reference, and the outline the active page publishes
 * for the outline view. Pages are tabs (`manual.page` panes); opening one is a layout action.
 */
import type { Kernel } from "../kernel/kernel.svelte";
import { loadApi, buildMode, siteVersion, paths } from "virtual:fw-docs";
import { docsets, catalog, ordered, resolve, type ApiSymbol, type DocPage, type Heading } from "./docs";

export type DocKind = "manual" | "reference";

export interface Outline {
	pane: string;
	key: string;
	headings: Heading[];
	/** Ids of headings whose section is on screen (the MDN style outline). */
	visible: string[];
	/** Ids of sections scrolled past. */
	read: string[];
	/** 0 to 1, how far down the page. */
	progress: number;
}

export class ManualState {
	/** FaNWiT's docs when present (development), else the app's. */
	set = $state(docsets.find((s) => s.id === "fanwit")?.id ?? docsets[0]?.id ?? "");
	kind = $state<DocKind>("manual");
	api = $state.raw<Record<string, ApiSymbol[]>>({});
	apiState = $state<"idle" | "loading" | "ready" | "error">("idle");
	outline = $state.raw<Outline | null>(null);
	/** A scroll request for a page that is open (anchor in an already open tab). */
	jump = $state.raw<{ key: string; anchor: string; n: number } | null>(null);
	/** Terms to highlight in a page opened from search. */
	highlight = $state.raw<{ key: string; terms: string[] } | null>(null);
	/** The published versions of the docs site (`versions.json` next to the version folders). */
	versions = $state.raw<{ latest: string; versions: string[]; root: string } | null>(null);
	/** Search box: focus requests and an initial query (manual.search). */
	searchRequest = $state.raw<{ query: string; n: number } | null>(null);

	/** Pages read to the end (or marked read), remembered across sessions. */
	read = $state.raw<ReadonlySet<string>>(new Set());

	readonly pages = $derived(catalog(this.api));
	readonly docset = $derived(docsets.find((s) => s.id === this.set));
	/**
	 * The page pane the outline follows: the focused one, else the shown tab of the first tab set
	 * holding pages (two pages side by side: the one you last clicked).
	 */
	readonly activePane = $derived.by(() => {
		const L = this.k.sys.layout;
		const doc = L.doc;
		if (L.activeDocument && doc.pane[L.activeDocument]?.view === "manual.page") return L.activeDocument;
		for (const n of Object.values(doc.node) as { type: string; panes?: string[]; active?: string }[]) {
			if (n.type !== "tabs" || !n.panes?.length) continue;
			const shown = n.active && n.panes.includes(n.active) ? n.active : n.panes[0];
			if (doc.pane[shown]?.view === "manual.page") return shown;
		}
		return undefined;
	});
	/** Navigation for the current docset and kind. */
	readonly nav = $derived(ordered(this.pages.filter((p) => p.set === this.set && p.kind === this.kind), this.docset));

	constructor(readonly k: Kernel) {
		void k.sys.storage
			.get<string[]>("fanwit.manual", "read")
			.then((r) => Array.isArray(r) && (this.read = new Set([...r, ...this.read])))
			.catch(() => {});
		// the API reference (TypeDoc) loads when Reference is first shown, so its pages are listed
		$effect.root(() => {
			$effect(() => {
				if (this.kind === "reference" && this.docset?.api) void this.loadApi();
			});
		});
	}

	find(key: string): DocPage | undefined {
		return this.pages.find((p) => p.key === key);
	}

	/** First page of a docset's manual. */
	home(set = this.set): string | undefined {
		const s = docsets.find((d) => d.id === set);
		return ordered(this.pages.filter((p) => p.set === set && p.kind === "manual"), s)[0]?.key ?? this.pages.find((p) => p.set === set)?.key;
	}

	/** Neighbours in navigation order, for prev and next links. */
	neighbours(key: string): { prev?: DocPage; next?: DocPage } {
		const p = this.find(key);
		if (!p) return {};
		const list = ordered(this.pages.filter((x) => x.set === p.set && x.kind === p.kind), docsets.find((s) => s.id === p.set));
		const i = list.findIndex((x) => x.key === key);
		return { prev: list[i - 1], next: list[i + 1] };
	}

	/** Mark a page read (or unread) and remember it. */
	markRead(key: string, read = true) {
		if (this.read.has(key) === read) return;
		const next = new Set(this.read);
		if (read) next.add(key);
		else next.delete(key);
		this.read = next;
		void this.k.sys.storage.set("fanwit.manual", "read", [...next]).catch(() => {});
	}

	/** Learning paths a page is part of, with its position in each. */
	pathsOf(key: string) {
		return Object.values(paths)
			.flat()
			.flatMap((p) => {
				const i = p.pages.indexOf(key);
				return i < 0 ? [] : [{ path: p, index: i, next: p.pages[i + 1] }];
			});
	}

	async loadApi() {
		if (this.apiState === "loading" || this.apiState === "ready") return;
		this.apiState = "loading";
		try {
			this.api = (await loadApi()).default;
			this.apiState = "ready";
		} catch (e) {
			this.apiState = "error";
			this.k.sys.notify.error(e);
		}
	}

	/**
	 * Open `manual://set/page#anchor` (or a bare page id) as a tab. Single clicks replace the
	 * preview tab, like an editor; `newTab` keeps it.
	 */
	open(target: string, o: { newTab?: boolean; from?: string; terms?: string[] } = {}): boolean {
		const r = resolve(target, this.pages, o.from ?? this.set);
		if (!r) {
			this.k.sys.notify.toast(`No manual page "${target.replace(/^manual:\/\//, "")}".`, "warning");
			return false;
		}
		if (o.terms?.length) this.highlight = { key: r.key, terms: o.terms };
		const doc = this.k.sys.layout.doc;
		// already showing it (the start tab has no page prop: it shows the docset's home)
		const home = this.home();
		const showing = Object.entries(doc.pane).find(([, p]) => p.view === "manual.page" && (p.props?.page || home) === r.key)?.[0];
		if (showing) {
			void this.k.sys.layout.dispatch({ type: "selectPane", pane: showing });
			if (r.anchor) this.jump = { key: r.key, anchor: r.anchor, n: Date.now() };
			return true;
		}
		const pane = Object.entries(doc.pane).find(([, p]) => p.view === "manual.page")?.[0];
		const tabs = pane ? Object.entries(doc.node).find(([, n]) => (n as { panes?: string[] }).panes?.includes(pane))?.[0] : doc.node.pages ? "pages" : undefined;
		void this.k.sys.layout.dispatch({ type: "openView", view: "manual.page", props: { page: r.key }, target: tabs, preview: !o.newTab });
		if (r.anchor) this.jump = { key: r.key, anchor: r.anchor, n: Date.now() };
		return true;
	}

	/**
	 * On a versioned docs site (`<root>/v/<version>/`), read `<root>/versions.json` for the version
	 * picker and the "newer version" banner. Nothing to do anywhere else.
	 */
	async loadVersions(base: string) {
		if (buildMode !== "docs" || !siteVersion) return;
		const root = base.replace(/\/v\/[^/]+$/, "");
		try {
			const v = (await (await fetch(`${root}/versions.json`, { cache: "no-cache" })).json()) as { latest: string; versions: string[] };
			if (Array.isArray(v.versions)) this.versions = { ...v, root };
		} catch {
			/* not published yet */
		}
	}

	/** Open the same page in another published version. */
	switchVersion(version: string) {
		if (!this.versions) return;
		const page = new URL(location.href).searchParams.get("page");
		location.href = `${this.versions.root}/v/${version}/${page ? `?page=${encodeURIComponent(page)}` : ""}`;
	}

	/** The docs site keeps the page in the address bar, so links can be shared. */
	syncUrl(key: string) {
		if (buildMode !== "docs") return;
		const url = new URL(location.href);
		if (url.searchParams.get("page") === key) return;
		url.searchParams.set("page", key);
		// through SvelteKit, so its router keeps its own state
		void import("$app/navigation").then(({ replaceState }) => replaceState(url, {})).catch(() => {});
	}
}

let state: ManualState | null = null;
/** The window's manual state (one kernel per window). */
export const manualState = (k: Kernel) => (state ??= new ManualState(k));
