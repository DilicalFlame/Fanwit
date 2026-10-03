/** The manual: docs/**\/*.md (single source) plus references generated from the registries. */
import type { Kernel } from "../kernel/kernel.svelte";
import { argSpecs } from "../commands/args";
import { frontMatter } from "./markdown";

const files = import.meta.glob("/docs/**/*.md", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;

export interface DocPage {
	id: string;
	title: string;
	section: string;
	order: number;
	load(): Promise<string>;
}

const SECTIONS = ["Getting started", "Concepts", "Guides", "Recipes", "Reference", "Operations"];

let cache: DocPage[] | null = null;
const texts = new Map<string, string>();

export async function pages(k: Kernel): Promise<DocPage[]> {
	if (!cache) {
		const list: DocPage[] = [];
		for (const [path, load] of Object.entries(files)) {
			const id = path.replace(/^\/docs\//, "").replace(/\.md$/, "");
			const text = await load();
			texts.set(id, text);
			const { meta, body } = frontMatter(text);
			list.push({ id, title: meta.title ?? /^#\s+(.*)$/m.exec(body)?.[1] ?? id, section: meta.section ?? "Guides", order: Number(meta.order ?? 50), load: async () => text });
		}
		list.push(...generated(k));
		cache = list.sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.order - b.order || a.title.localeCompare(b.title));
	}
	return cache;
}

export function sections(list: DocPage[]) {
	const m = new Map<string, DocPage[]>();
	for (const p of list) m.set(p.section, [...(m.get(p.section) ?? []), p]);
	return [...m.entries()];
}

/** Generated references: never out of date because they read the live registries. */
function generated(k: Kernel): DocPage[] {
	const page = (id: string, title: string, order: number, build: () => string): DocPage => ({ id, title, section: "Reference", order, load: async () => build() });
	return [
		page("reference/commands", "Commands", 1, () => {
			const rows = k.commands.list().sort((a, b) => a.def.id.localeCompare(b.def.id));
			return `# Commands\n\nEvery registered command (${rows.length}). Generated from the command registry.\n\n| Id | Title | Keys | Args | CLI |\n|---|---|---|---|---|\n${rows
				.map((c) => `| \`${c.def.id}\` | ${c.def.title} | ${k.keys.label(c.def.id)?.join(" ") ?? ""} | ${Object.keys(argSpecs(c.def.args)).join(", ")} | ${c.def.cli ? "yes" : ""} |`)
				.join("\n")}\n`;
		}),
		page("reference/settings", "Settings", 2, () => `# Settings\n\n| Key | Type | Default | Title |\n|---|---|---|---|\n${k.sys.settings.list().map((d) => `| \`${d.key}\` | ${d.type} | \`${JSON.stringify(d.default)}\` | ${d.title ?? ""} |`).join("\n")}\n`),
		page("reference/menu-locations", "Menu locations", 3, () => `# Menu locations\n\n| Location | Description | Target |\n|---|---|---|\n${[...k.sys.menus.locations.values()].map((l) => `| \`${l.id}\` | ${l.description ?? ""} | ${l.target ?? ""} |`).join("\n")}\n`),
		page("reference/views", "Views", 4, () => `# Views\n\n| Id | Title | Regions | Owner |\n|---|---|---|---|\n${[...k.sys.layout.views.values()].map((v) => `| \`${v.id}\` | ${typeof v.title === "string" ? v.title : "(dynamic)"} | ${v.regions?.join(", ") ?? ""} | ${v.owner} |`).join("\n")}\n`),
		page("reference/window-kinds", "Window kinds", 5, () => `# Window kinds\n\n| Kind | Base | View | Focus | Web |\n|---|---|---|---|---|\n${[...k.sys.windows.kinds.values()].map((w) => `| \`${w.kind}\` | ${w.base} | ${w.view ?? ""} | ${w.focus ?? ""} | ${w.web ?? ""} |`).join("\n")}\n`),
		page("reference/context-keys", "Context keys", 6, () => `# Context keys\n\nKeys usable in when clauses.\n\n| Key | Type | Meaning |\n|---|---|---|\n${k.context.declared.map((d) => `| \`${d.key}\` | ${d.type} | ${d.description ?? ""} |`).join("\n")}\n`),
		page("reference/keybindings", "Keybindings", 7, () => `# Keybindings\n\n| Keys | Command | When | Source |\n|---|---|---|---|\n${k.keys.effective().map((b) => `| ${k.keys.format(b.steps).join(" ")} | \`${b.command}\` | ${b.when ? `\`${b.when}\`` : ""} | ${b.source} |`).join("\n")}\n`)
	];
}

export function textOf(id: string) {
	return texts.get(id) ?? "";
}
