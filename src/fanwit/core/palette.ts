/** Built in palette providers (Section 5.4). */
import type { Kernel } from "../kernel/kernel.svelte";
import { compileWhen } from "../kernel/when";
import type { PaletteItem, PaletteProvider } from "../workbench/palette-service.svelte";
import { fuzzy } from "../workbench/fuzzy";
import { basename, extname } from "../host/types";

const run = (k: Kernel, id: string, args: Record<string, unknown> = {}) => () => k.commands.run(id, args, { source: "palette" }).catch((e) => k.sys.notify.error(e));

export const commandsProvider: PaletteProvider = {
	prefix: ">",
	title: "Commands",
	placeholder: "Type a command",
	provide(q, k) {
		const lookup = k.context.lookup(null);
		const focused = String(lookup("focusedView") ?? "");
		const out: PaletteItem[] = [];
		for (const e of k.commands.list()) {
			const d = e.def;
			if (d.palette === false) continue;
			if (d.visibleWhen && !compileWhen(d.visibleWhen).eval(lookup)) continue;
			const label = d.title;
			const full = d.category ? `${d.category}: ${d.title}` : d.title;
			const m = fuzzy(q, full) ?? fuzzy(q, d.id);
			if (!m) continue;
			const enabled = !d.when || compileWhen(d.when).eval(lookup);
			// disabled commands show only on an exact title match, with the reason
			if (!enabled && q.toLowerCase() !== label.toLowerCase() && q.toLowerCase() !== full.toLowerCase()) continue;
			const offset = d.category ? d.category.length + 2 : 0;
			let score = m.score + k.commands.frecencyScore(d.id) * (q ? 2 : 10);
			if (focused && d.when?.includes(focused)) score += 6;
			out.push({
				id: d.id,
				label,
				category: d.category,
				icon: d.icon ?? "square-terminal",
				description: q ? d.id : d.description,
				keys: k.keys.label(d.id),
				positions: m.positions.filter((p) => p >= offset).map((p) => p - offset),
				disabled: enabled ? null : k.context.explain(d.when, lookup),
				score,
				run: run(k, d.id)
			});
		}
		return out.sort((a, b) => b.score! - a.score!).slice(0, 200);
	}
};

let fileCache: { vault: string; files: string[]; time: number } | null = null;
async function vaultFiles(k: Kernel): Promise<string[]> {
	const v = k.sys.vault.current;
	if (!v) return [];
	if (fileCache && fileCache.vault === v.path && Date.now() - fileCache.time < 5000) return fileCache.files;
	const list = await k.sys.vault.fs.list("", { recursive: true }).catch(() => []);
	fileCache = { vault: v.path, files: list.filter((e) => !e.dir).map((e) => e.path), time: Date.now() };
	return fileCache.files;
}

export function viewForPath(k: Kernel, path: string): string | undefined {
	const ext = extname(path);
	for (const v of k.sys.layout.views.values()) if ((v as { opens?: string[] }).opens?.includes(ext)) return v.id;
	for (const v of k.sys.layout.views.values()) if ((v as { opens?: string[] }).opens?.includes("*")) return v.id;
	return undefined;
}

export const quickOpenProvider: PaletteProvider = {
	prefix: "",
	title: "Quick open",
	placeholder: "Search files, tabs and vaults by name (> for commands)",
	async provide(q, k) {
		const out: PaletteItem[] = [];
		const layout = k.sys.layout;
		for (const [id, p] of Object.entries(layout.doc.pane)) {
			const title = layout.paneTitle(id);
			const m = fuzzy(q, title);
			if (!m || !p.props) continue;
			out.push({ id: `tab:${id}`, label: title, detail: "open tab", icon: layout.views.get(p.view)?.icon ?? "file", positions: m.positions, score: m.score + 3, run: () => layout.dispatch({ type: "selectPane", pane: id }).then(() => layout.focusPane(id)) });
		}
		for (const f of await vaultFiles(k)) {
			const name = basename(f);
			const m = fuzzy(q, name) ?? fuzzy(q, f);
			if (!m) continue;
			const view = viewForPath(k, f);
			out.push({
				id: `file:${f}`,
				label: name,
				description: f,
				icon: "file-text",
				positions: fuzzy(q, name)?.positions,
				score: m.score,
				run: () => (view ? layout.openView(view, { path: f }, { preview: !!k.sys.settings.get("layout.previewTabs") }) : k.sys.notify.toast(`No view opens ${name}`))
			});
		}
		if (!k.sys.vault.current) {
			for (const v of k.sys.vault.recentList) {
				const m = fuzzy(q, v.name);
				if (m) out.push({ id: `vault:${v.path}`, label: v.name, description: v.path, detail: "vault", icon: "library", positions: m.positions, score: m.score, run: () => k.sys.vault.open(v.path).catch((e) => k.sys.notify.error(e)) });
			}
		}
		if (!q) out.push({ id: "hint:commands", label: "Show all commands", icon: "square-terminal", keys: k.keys.label("palette.open"), score: -100, run: () => k.sys.palette.open(">") });
		return out.sort((a, b) => b.score! - a.score!).slice(0, 100);
	}
};

export const helpProvider: PaletteProvider = {
	prefix: "?",
	title: "Help",
	provide(_q, k) {
		const p = k.sys.palette;
		const modes: [string, string, string][] = [
			["", "Quick open files, tabs and vaults", "search"],
			[">", "Run a command", "square-terminal"],
			["@", "Symbols in the active view", "at-sign"],
			["#", "Tags and search", "hash"],
			[":", "Go to line, page or slide", "corner-down-right"],
			["~", "Switch window or tab", "app-window"],
			["?", "This help", "circle-help"]
		];
		return [
			...modes.map(([pre, label, icon]) => ({ id: `mode:${pre}`, label: `${pre || "(no prefix)"}  ${label}`, icon, run: () => (p.visible = true, p.setQuery(pre)) })),
			{ id: "manual", label: "Open the manual", icon: "book-open", keys: k.keys.label("manual.open"), run: run(k, "manual.open") }
		];
	}
};

export const windowsProvider: PaletteProvider = {
	prefix: "~",
	title: "Windows and tabs",
	async provide(q, k) {
		const out: PaletteItem[] = [];
		const layout = k.sys.layout;
		for (const id of Object.keys(layout.doc.pane)) {
			const m = fuzzy(q, layout.paneTitle(id));
			if (m) out.push({ id, label: layout.paneTitle(id), icon: layout.views.get(layout.doc.pane[id].view)?.icon ?? "file", positions: m.positions, score: m.score, run: () => layout.dispatch({ type: "selectPane", pane: id }) });
		}
		for (const label of await k.host.windows.list().catch(() => [])) {
			const m = fuzzy(q, label);
			if (m && label !== k.host.windows.label) out.push({ id: `win:${label}`, label, detail: "window", icon: "app-window", score: m.score, run: () => k.host.windows.focus(label) });
		}
		for (const v of k.sys.windows.virtual) {
			const m = fuzzy(q, v.title);
			if (m) out.push({ id: `vwin:${v.id}`, label: v.title, detail: "window", icon: "app-window", score: m.score, run: () => k.sys.windows.raise(v.id) });
		}
		return out.sort((a, b) => b.score! - a.score!);
	}
};

/** Views provide symbols (@), go to (:) and tags (#) through the focused view's provider. */
export interface ViewNavigation {
	symbols?(q: string): PaletteItem[] | Promise<PaletteItem[]>;
	goto?(q: string): PaletteItem[] | Promise<PaletteItem[]>;
	tags?(q: string): PaletteItem[] | Promise<PaletteItem[]>;
}
export const viewNavigation = new Map<string, ViewNavigation>();

const delegate = (prefix: "@" | ":" | "#", key: keyof ViewNavigation, title: string): PaletteProvider => ({
	prefix,
	title,
	async provide(q, k) {
		const pane = k.sys.layout.activePane;
		const nav = pane ? (viewNavigation.get(pane) ?? viewNavigation.get(k.sys.layout.doc.pane[pane]?.view ?? "")) : undefined;
		const fn = nav?.[key];
		if (!fn) return [{ id: "none", label: `The active view has no ${title.toLowerCase()}`, icon: "info", disabled: null, run: () => {} }];
		return fn(q);
	}
});

export const builtinProviders: PaletteProvider[] = [commandsProvider, quickOpenProvider, helpProvider, windowsProvider, delegate("@", "symbols", "Symbols"), delegate(":", "goto", "Go to"), delegate("#", "tags", "Tags")];
