/**
 * The manual's doc model in the app: written pages from `virtual:fw-docs` (Markdown compiled by
 * mdsvex), plus pages generated at runtime from the live registries, the TOML schemas, the error
 * codes and the TypeDoc API reference. Every page has a key `<docset>/<id>`.
 */
import type { Component } from "svelte";
import { docsets as sets, pages as written, loaders, schemas, errors, glossary, rust, fwCli, paths, type JsonSchema } from "virtual:fw-docs";
import type { Kernel } from "../kernel/kernel.svelte";
import { argSpecs } from "../commands/args";
import { resolveLink as resolveIn } from "./links.mjs";
import type { Docset, PageMeta } from "./discover.mjs";
import type { ApiSymbol } from "./api.mjs";

export type { Docset, ApiSymbol };
export interface Heading {
	level: number;
	text: string;
	id: string;
}

/** A page: written (a Svelte component), generated (Markdown built on demand) or an API symbol. */
export interface DocPage extends Omit<PageMeta, "file"> {
	/** written pages: repo path, for "Edit this page" */
	file?: string;
	source: "written" | "generated" | "api" | "paths";
	/** written pages */
	component?: () => Promise<{ default: Component }>;
	/** generated pages */
	markdown?: (k: Kernel) => string;
	/** API pages */
	symbol?: ApiSymbol;
}

export const docsets: Docset[] = sets;

const isCore = (owner: string | undefined) => !owner || owner === "fanwit" || owner.startsWith("fanwit.") || owner === "user";
/** Registry rows a docset documents: everything for FaNWiT's, the app's own for the others. */
const mine = (set: string) => (owner: string | undefined) => set === "fanwit" || !isCore(owner);
const cell = (s: unknown) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

const REGISTRY: Record<string, { title: string; build: (k: Kernel, set: string) => string }> = {
	commands: {
		title: "Commands",
		build: (k, set) => {
			const rows = k.commands
				.list()
				.filter((c) => mine(set)(c.owner))
				.sort((a, b) => a.def.id.localeCompare(b.def.id));
			return `# Commands\n\nEvery registered command (${rows.length}), generated from the command registry. Run one from the palette, a key, a menu, the CLI or a \`fanwit://run/<id>\` link.\n\n| Id | Title | Keys | Args | CLI |\n|---|---|---|---|---|\n${rows
				.map((c) => `| \`${c.def.id}\` | ${cell(c.def.title)} | ${k.keys.label(c.def.id)?.join(" ") ?? ""} | ${Object.keys(argSpecs(c.def.args)).join(", ")} | ${c.def.cli ? "yes" : ""} |`)
				.join("\n")}\n`;
		}
	},
	settings: {
		title: "Settings",
		build: (k, set) =>
			`# Settings\n\nEvery setting, generated from the settings schema. Change them in the Settings window or in \`settings.toml\`.\n\n| Key | Type | Default | Title |\n|---|---|---|---|\n${k.sys.settings
				.list()
				.filter((d) => mine(set)((d as { owner?: string }).owner))
				.map((d) => `| \`${d.key}\` | ${d.type} | \`${cell(JSON.stringify(d.default))}\` | ${cell(d.title)} |`)
				.join("\n")}\n`
	},
	keybindings: {
		title: "Keybindings",
		build: (k, set) =>
			`# Keybindings\n\nThe effective bindings, generated from the keybinding registry and your \`keys.toml\`.\n\n| Keys | Command | When | Source |\n|---|---|---|---|\n${k.keys
				.effective()
				.filter((b) => mine(set)(b.owner))
				.map((b) => `| ${k.keys.format(b.steps).join(" ")} | \`${b.command}\` | ${b.when ? `\`${cell(b.when)}\`` : ""} | ${b.source} |`)
				.join("\n")}\n`
	},
	views: {
		title: "Views",
		build: (k, set) =>
			`# Views\n\n| Id | Title | Regions | Owner |\n|---|---|---|---|\n${[...k.sys.layout.views.values()]
				.filter((v) => mine(set)(v.owner))
				.map((v) => `| \`${v.id}\` | ${typeof v.title === "string" ? cell(v.title) : "(dynamic)"} | ${v.regions?.join(", ") ?? ""} | ${v.owner} |`)
				.join("\n")}\n`
	},
	"window-kinds": {
		title: "Window kinds",
		build: (k, set) =>
			`# Window kinds\n\n| Kind | Base | View | Focus | Web |\n|---|---|---|---|---|\n${[...k.sys.windows.kinds.values()]
				.filter((w) => mine(set)((w as { owner?: string }).owner))
				.map((w) => `| \`${w.kind}\` | ${w.base} | ${w.view ?? (w.layout ? `layout \`${w.layout}\`` : "")} | ${w.focus ?? ""} | ${w.web ?? ""} |`)
				.join("\n")}\n`
	},
	"menu-locations": {
		title: "Menu locations",
		build: (k) => `# Menu locations\n\n| Location | Description | Target |\n|---|---|---|\n${[...k.sys.menus.locations.values()].map((l) => `| \`${l.id}\` | ${cell(l.description)} | ${l.target ?? ""} |`).join("\n")}\n`
	},
	"context-keys": {
		title: "Context keys",
		build: (k) => `# Context keys\n\nKeys usable in when clauses.\n\n| Key | Type | Meaning |\n|---|---|---|\n${k.context.declared.map((d) => `| \`${d.key}\` | ${d.type} | ${cell(d.description)} |`).join("\n")}\n`
	},
	errors: {
		title: "Error codes",
		build: () =>
			`# Error codes\n\nEvery \`FanwitError\` code thrown by the source, with its message and the page that explains it.\n\n| Code | Message | Docs | Source |\n|---|---|---|---|\n${errors
				.map((e) => `| \`${e.code}\` | ${cell(e.message)}${e.hint ? ` *${cell(e.hint)}*` : ""} | ${e.docs ? `[${e.docs.replace("manual://", "")}](${e.docs})` : ""} | \`${e.file}:${e.line}\` |`)
				.join("\n")}\n`
	},
	glossary: {
		title: "Glossary",
		build: (_k, set) =>
			`# Glossary\n\nThe words this manual uses, each with one meaning. Pages underline them; hover one to see its definition.\n\n${(glossary[set] ?? [])
				.map((t) => `## ${t.name}\n\n${t.text}${t.aka.length ? `\n\nAlso written: ${t.aka.map((a) => `*${a}*`).join(", ")}.` : ""}\n`)
				.join("\n")}`
	},
	"fw-cli": {
		title: "fw developer CLI",
		build: () =>
			`# fw developer CLI\n\nThe developer CLI scaffolds, checks and builds. Run it as \`pnpm fw <command>\`; every command accepts \`--dry-run\`. Generated from \`fw help\`.\n\n| Command | What it does |\n|---|---|\n${fwCli.map((c) => `| ${c.usage.split("\n").map((u) => `\`${cell(u)}\``).join(" ")} | ${cell(c.text)} |`).join("\n")}\n`
	},
	"rust-commands": {
		title: "Rust commands",
		build: (_k, set) =>
			`# Rust commands\n\nThe Tauri commands the webview can call. Feature code never calls them directly: the Host wraps them (\`ctx.host\`), and the Rust side checks every path against the sandbox. Arguments are shown as the webview passes them (camelCase).\n\n${(rust[set] ?? [])
				.map((f) => `## ${f.file.split("/").pop()}\n\n${f.about}\n\n| Command | Arguments | Returns | Description |\n|---|---|---|---|\n${f.commands.map((c) => `| \`${c.name}\` | ${c.args.map((a) => `\`${cell(a)}\``).join(", ")} | \`${cell(c.returns)}\` | ${cell(c.doc)} |`).join("\n")}\n`)
				.join("\n")}`
	}
};

/** Navigation group of generated pages that are not registries. */
const SECTION: Record<string, string> = { glossary: "Glossary", "fw-cli": "CLI", "rust-commands": "Rust" };

/** A JSON schema as reference tables, one table per object level. */
function schemaPage(name: string, schema: JsonSchema): string {
	const out = [`# ${name}.toml\n\n${schema.description ?? schema.title ?? ""}\n\nGenerated from \`schemas/${name}.schema.json\`. Point an editor at it with \`#:schema\` for completion.\n`];
	const walk = (s: JsonSchema, at: string) => {
		const props = s.properties ?? (s.items?.properties ? s.items.properties : undefined);
		if (!props) return;
		const where = s.items?.properties ? `${at}[]` : at;
		const req = new Set(s.required ?? s.items?.required ?? []);
		out.push(`\n## ${where || "Top level"}\n\n| Key | Type | Default | Description |\n|---|---|---|---|\n${Object.entries(props)
			.map(([k, p]) => `| \`${k}\`${req.has(k) ? " (required)" : ""} | ${[p.type ?? (p.enum ? "enum" : "")].flat().join(" \\| ")}${p.enum ? `: ${p.enum.map((e) => `\`${e}\``).join(", ")}` : ""} | ${p.default !== undefined ? `\`${cell(JSON.stringify(p.default))}\`` : ""} | ${cell(p.description)} |`)
			.join("\n")}\n`);
		for (const [k, p] of Object.entries(props)) walk(p, where ? `${where}.${k}` : k);
		if (typeof s.additionalProperties === "object") walk(s.additionalProperties, `${where}.<name>`);
	};
	walk(schema, "");
	return out.join("");
}

const meta = (set: string, id: string, title: string, section: string, order: number): Omit<PageMeta, "file"> => ({ set, id, key: `${set}/${id}`, title, section, order, kind: "reference", headings: [], words: 0 });

/** Every page of the included docsets. `api` adds the TypeDoc symbols once they are loaded. */
export function catalog(api: Record<string, ApiSymbol[]> = {}): DocPage[] {
	const list: DocPage[] = written.map((p) => ({ ...p, source: "written", component: loaders[p.key] }));
	for (const s of docsets) {
		s.reference.forEach((r, i) => {
			const g = REGISTRY[r];
			if (g) list.push({ ...meta(s.id, `reference/${r}`, g.title, SECTION[r] ?? "Registries", i + 1), source: "generated", markdown: (k) => g.build(k, s.id) });
		});
		for (const { name, schema } of schemas[s.id] ?? []) list.push({ ...meta(s.id, `toml/${name}`, `${name}.toml`, "TOML files", 1), source: "generated", markdown: () => schemaPage(name, schema) });
		for (const sym of api[s.id] ?? []) list.push({ ...meta(s.id, sym.id, sym.name, "API", 1), source: "api", symbol: sym, since: sym.since });
		// a docset with paths.toml gets a Learning paths page at the top of its manual
		if (paths[s.id]?.length) list.push({ ...meta(s.id, "learn", "Learning paths", s.sections[0] ?? "Getting started", 0), kind: "manual", source: "paths" });
	}
	return list;
}

/** The level that owns a section (docset.toml [[levels]]); undefined: every level shows it. */
export const levelOf = (set: Docset | undefined, section: string): string | undefined => set?.levels.find((l) => l.sections.includes(section))?.id;

/** Navigation order: docset sections, then `order`, then title. */
export function ordered(list: DocPage[], set: Docset | undefined): DocPage[] {
	const at = (s: string) => {
		const i = set?.sections.indexOf(s) ?? -1;
		return i < 0 ? 999 : i;
	};
	return [...list].sort((a, b) => at(a.section) - at(b.section) || a.order - b.order || a.title.localeCompare(b.title));
}

export function sections(list: DocPage[]): [string, DocPage[]][] {
	const m = new Map<string, DocPage[]>();
	for (const p of list) m.set(p.section, [...(m.get(p.section) ?? []), p]);
	return [...m.entries()];
}

/**
 * Resolve `manual://set/page#anchor` (or a bare `page`, `manual://layout#views`) against the
 * catalog. Returns the page key and anchor, or null when nothing matches.
 */
export function resolve(target: string, list: DocPage[], from?: string): { key: string; anchor?: string } | null {
	return resolveIn(target, new Set(list.map((p) => p.key)), from ?? docsets.find((s) => s.id === "fanwit")?.id ?? docsets[0]?.id);
}

/** Tab title for a page key, without the kernel (view titles are plain functions). */
export function titleOf(key: string): string {
	if (!key) return "Manual";
	const w = written.find((p) => p.key === key);
	if (w) return w.title;
	const id = key.split("/").slice(1).join("/");
	if (id.startsWith("reference/")) return REGISTRY[id.slice(10)]?.title ?? id;
	if (id.startsWith("toml/")) return `${id.slice(5)}.toml`;
	if (id.startsWith("api/")) return id.slice(4);
	if (id === "learn") return "Learning paths";
	return id.split("/").pop() ?? key;
}

/** Minutes to read, at 230 words a minute. */
export const readingMinutes = (p: Pick<DocPage, "words">) => Math.max(1, Math.round(p.words / 230));
