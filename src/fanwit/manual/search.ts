/**
 * Unified search: written pages and their sections (a MiniSearch index built at build time),
 * generated pages, the API, commands, settings and error codes. A prefix narrows it to one kind,
 * the same way the command palette's prefixes do.
 */
import MiniSearch from "minisearch";
import { loadSearch, errors } from "virtual:fw-docs";
import { fuzzy } from "../workbench/fuzzy";
import { SEARCH_OPTIONS } from "./search-options";
import { manualState, type ManualState } from "./state.svelte";
import type { Kernel } from "../kernel/kernel.svelte";
import type { PaletteItem } from "../workbench/palette-service.svelte";

export type HitType = "page" | "section" | "api" | "command" | "setting" | "error";

export const MODES: { prefix: string; type: HitType; label: string; icon: string }[] = [
	{ prefix: "/", type: "page", label: "Pages", icon: "file-text" },
	{ prefix: "#", type: "section", label: "Sections", icon: "hash" },
	{ prefix: "@", type: "api", label: "API", icon: "braces" },
	{ prefix: ">", type: "command", label: "Commands", icon: "square-terminal" },
	{ prefix: ":", type: "setting", label: "Settings", icon: "settings" },
	{ prefix: "!", type: "error", label: "Errors", icon: "circle-alert" }
];

export interface Hit {
	id: string;
	type: HitType;
	title: string;
	detail?: string;
	/** Where it lives: docset and section, or a command id. */
	context?: string;
	/** Characters of `title` that matched (bold). */
	positions?: number[];
	score: number;
	/** Pages and sections: the page to open. */
	page?: string;
	/** Commands and settings: what selecting it does. */
	run?: () => unknown;
}

let index: Promise<MiniSearch> | null = null;
const loadIndex = () => (index ??= loadSearch().then((m) => MiniSearch.loadJSON(m.default, SEARCH_OPTIONS)));

/** Split "@ dispatch" into the mode and the query. */
export function parseQuery(raw: string): { type?: HitType; q: string } {
	const m = MODES.find((x) => raw.startsWith(x.prefix));
	return m ? { type: m.type, q: raw.slice(m.prefix.length).trim() } : { q: raw.trim() };
}

/**
 * Search everything (or one kind). `set` limits pages and the API to one docset; commands,
 * settings and errors belong to the whole app. At most `limit` hits per kind.
 */
export async function search(st: ManualState, raw: string, o: { set?: string; limit?: number } = {}): Promise<Hit[]> {
	const { type, q } = parseQuery(raw);
	if (!q) return [];
	const want = (t: HitType) => !type || type === t;
	const limit = o.limit ?? (type ? 50 : 6);
	const inSet = (set: string) => !o.set || set === o.set;
	const k = st.k;
	const out: Hit[] = [];
	const take = (hits: Hit[]) => out.push(...hits.sort((a, b) => b.score - a.score).slice(0, limit));

	if (want("page") || want("section")) {
		const ms = await loadIndex();
		const found = ms.search(q, SEARCH_OPTIONS.searchOptions).filter((r) => inSet(r.set as string));
		const set = (s: string) => (o.set ? "" : `${s} · `);
		if (want("page")) {
			const written: Hit[] = found
				.filter((r) => r.type === "page")
				.map((r) => ({ id: r.id, type: "page", title: r.title as string, context: `${set(r.set)}${r.section}`, score: r.score, page: r.key as string }));
			// generated pages (registries, TOML, API) are not in the index: match their titles
			const generated: Hit[] = st.pages
				.filter((p) => p.source !== "written" && p.source !== "api" && inSet(p.set))
				.flatMap((p) => {
					const m = fuzzy(q, p.title);
					return m ? [{ id: p.key, type: "page" as const, title: p.title, context: `${set(p.set)}${p.section}`, positions: m.positions, score: m.score / 4, page: p.key }] : [];
				});
			take([...written, ...generated]);
		}
		if (want("section"))
			take(
				found
					.filter((r) => r.type === "section")
					.map((r) => ({ id: r.id, type: "section", title: r.title as string, context: `${set(r.set)}${r.page}`, score: r.score, page: `${r.key}#${r.anchor}` }))
			);
	}

	if (want("api")) {
		// only an @ search waits for the API; plain searches use it once it is there
		if (type === "api" && st.apiState === "idle") await st.loadApi();
		const hits: Hit[] = [];
		for (const [set, symbols] of Object.entries(st.api)) {
			if (!inSet(set)) continue;
			for (const s of symbols) {
				const m = fuzzy(q, s.name);
				if (m) hits.push({ id: `${set}/${s.id}`, type: "api", title: s.name, detail: s.signature[0], context: s.kind, positions: m.positions, score: m.score + (s.name.toLowerCase() === q.toLowerCase() ? 50 : 0), page: `${set}/${s.id}` });
				for (const mem of s.members) {
					const mm = fuzzy(q, `${s.name}.${mem.name}`);
					if (mm && mm.score > 0) hits.push({ id: `${set}/${s.id}#${mem.name}`, type: "api", title: `${s.name}.${mem.name}`, detail: mem.signature[0], context: mem.kind, positions: mm.positions, score: mm.score - 2, page: `${set}/${s.id}#${mem.name.toLowerCase()}` });
				}
			}
		}
		take(hits);
	}

	if (want("command")) {
		const hits: Hit[] = [];
		for (const e of k.commands.list()) {
			if (e.def.palette === false) continue;
			const title = k.commands.title(e.def.id);
			const m = fuzzy(q, title) ?? fuzzy(q, e.def.id);
			if (!m) continue;
			hits.push({
				id: `cmd:${e.def.id}`,
				type: "command",
				title,
				context: e.def.id,
				detail: k.keys.label(e.def.id)?.join(" "),
				positions: fuzzy(q, title)?.positions,
				score: m.score,
				run: () => k.commands.run(e.def.id, {}, { source: "api", interactive: true }).catch((err) => k.sys.notify.error(err))
			});
		}
		take(hits);
	}

	if (want("setting")) {
		const s = k.sys.settings;
		take(
			s.list().flatMap((d): Hit[] => {
				const m = fuzzy(q, d.title ?? d.key) ?? fuzzy(q, d.key);
				if (!m) return [];
				const v = s.get(d.key);
				return [
					{
						id: `set:${d.key}`,
						type: "setting",
						title: d.title ?? d.key,
						context: d.key,
						detail: !k.commands.get("app.settings") ? d.description : d.type === "boolean" ? (v ? "On, select to turn off" : "Off, select to turn on") : `${JSON.stringify(v)}`,
						positions: fuzzy(q, d.title ?? d.key)?.positions,
						score: m.score,
						// the docs site has no Settings window: a setting opens its reference entry
						...(k.commands.get("app.settings")
							? { run: () => (d.type === "boolean" ? s.set(d.key, !v) : k.commands.run("app.settings", { page: `@${d.key}` }).catch((e) => k.sys.notify.error(e))) }
							: { page: "fanwit/reference/settings" })
					}
				];
			})
		);
	}

	if (want("error")) {
		const errorsPage = st.pages.find((p) => p.id === "reference/errors" && inSet(p.set))?.key;
		take(
			errors.flatMap((e): Hit[] => {
				const m = fuzzy(q, e.code) ?? fuzzy(q, e.message);
				return m ? [{ id: `err:${e.code}`, type: "error", title: e.code, detail: e.message, context: e.file, positions: fuzzy(q, e.code)?.positions, score: m.score, page: e.docs ?? errorsPage }] : [];
			})
		);
	}
	return out;
}

const ICONS: Record<HitType, string> = Object.fromEntries(MODES.map((m) => [m.type, m.icon])) as Record<HitType, string>;

/** `?` in the command palette: manual search from any window (pages open in the Manual). */
export async function paletteSearch(q: string, k: Kernel): Promise<PaletteItem[]> {
	const hits = await search(manualState(k), q, { limit: 8 });
	return [
		...hits.map((h, i) => ({
			id: h.id,
			label: h.title,
			description: h.context,
			detail: h.detail,
			icon: ICONS[h.type],
			positions: h.positions,
			score: 100 - i,
			run: () => (h.run ? h.run() : h.page ? k.commands.run("manual.open", { page: h.page }) : undefined)
		})),
		{ id: "manual.search", label: `Search the manual for "${q.trim()}"`, icon: "book-search", score: -1, run: () => k.commands.run("manual.search", { query: q.trim() }) }
	];
}
