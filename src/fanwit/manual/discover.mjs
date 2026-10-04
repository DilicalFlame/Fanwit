/**
 * Docs discovery, shared by the Vite plugin (`virtual:fw-docs`) and `fw docs check`, so the app,
 * the web site and CI agree on what exists. Plain Node ESM: the fw CLI runs without a TS loader.
 *
 * A docset is a folder `docs/<id>/` with a `docset.toml`; its pages are the `.md` files below it.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "smol-toml";
import { frontMatter, headingsOf, plainText, sectionsOf } from "./links.mjs";

export { slug, headingsOf, frontMatter, plainText, sectionsOf, resolveLink } from "./links.mjs";

/** Generated pages a docset can list in `reference = [...]`: live registries and data read from the repo. */
export const REGISTRY_PAGES = ["commands", "settings", "menu-locations", "views", "window-kinds", "context-keys", "keybindings", "errors", "glossary", "fw-cli", "rust-commands"];

/**
 * @typedef {object} Docset
 * @property {string} id
 * @property {string} title
 * @property {string} icon
 * @property {string} version
 * @property {"dev" | "prod"} ship  `dev`: development builds only; `prod`: production builds too
 * @property {boolean} web  part of the static docs site (`fw docs build`)
 * @property {string[]} sections  section order in the navigation
 * @property {Level[]} levels  reading levels ([[levels]]), each owning some sections; empty: no levels
 * @property {string} [api]  TypeScript entry whose exports become the API reference
 * @property {string} [schemas]  folder of JSON schemas that become the TOML reference
 * @property {string} [rust]  folder of Rust sources whose Tauri commands become the Rust reference
 * @property {string[]} reference  registry pages (REGISTRY_PAGES)
 * @property {string} [edit]  "Edit this page" URL prefix
 * @property {string} dir  folder, relative to the repo root (posix)
 */

/**
 * @typedef {object} Level
 * @property {string} id  e.g. beginner
 * @property {string} title
 * @property {string} [summary]
 * @property {string[]} sections  sections shown at this level; a section no level lists shows at every level
 */

/**
 * @typedef {object} PageMeta
 * @property {string} set
 * @property {string} id  path below the docset without .md, e.g. guides/layout
 * @property {string} key  `<set>/<id>`
 * @property {string} file  repo relative posix path with a leading slash (Vite import id)
 * @property {string} title
 * @property {string} section
 * @property {number} order
 * @property {"manual" | "reference"} kind
 * @property {string} [since]
 * @property {string} [summary]
 * @property {{ level: number; text: string; id: string }[]} headings
 * @property {number} words
 */

/** @param {string} root @param {string} f @returns {Record<string, any>} */
const readToml = (root, f) => {
	try {
		return parse(fs.readFileSync(path.join(root, f), "utf8"));
	} catch {
		return {};
	}
};
const appName = (/** @type {string} */ root) => String(readToml(root, "fanwit.app.toml").app?.name ?? "App");

/** @param {string} root @param {string} v */
function resolveVersion(root, v) {
	if (v === "fanwit") return String(readToml(root, ".fanwit/lock.toml").template ?? "0.0.0");
	if (v === "app") return String(readToml(root, "fanwit.app.toml").app?.version ?? "0.0.0");
	return v || "0.0.0";
}

/** Every docset under `<root>/docs`. @param {string} root @returns {Docset[]} */
export function docsets(root) {
	const docs = path.join(root, "docs");
	if (!fs.existsSync(docs)) return [];
	return fs
		.readdirSync(docs, { withFileTypes: true })
		.filter((e) => e.isDirectory() && fs.existsSync(path.join(docs, e.name, "docset.toml")))
		.map((e) => {
			const t = /** @type {Record<string, any>} */ (parse(fs.readFileSync(path.join(docs, e.name, "docset.toml"), "utf8")));
			return {
				id: e.name,
				title: String(t.title ?? (e.name === "app" ? appName(root) : e.name)),
				icon: String(t.icon ?? "book-open"),
				version: resolveVersion(root, String(t.version ?? "")),
				ship: /** @type {"dev" | "prod"} */ (t.ship === "prod" ? "prod" : "dev"),
				web: t.web !== false,
				sections: Array.isArray(t.sections) ? t.sections.map(String) : [],
				levels: Array.isArray(t.levels)
					? t.levels.map((/** @type {Record<string, any>} */ l) => ({ id: String(l.id), title: String(l.title ?? l.id), summary: l.summary ? String(l.summary) : undefined, sections: Array.isArray(l.sections) ? l.sections.map(String) : [] }))
					: [],
				api: t.api ? String(t.api) : undefined,
				schemas: t.schemas ? String(t.schemas) : undefined,
				rust: t.rust ? String(t.rust) : undefined,
				reference: Array.isArray(t.reference) ? t.reference.map(String).filter((r) => REGISTRY_PAGES.includes(r)) : [],
				edit: t.edit ? String(t.edit) : undefined,
				dir: `docs/${e.name}`
			};
		})
		.sort((a, b) => (a.id === "app" ? -1 : b.id === "app" ? 1 : a.id.localeCompare(b.id)));
}

/**
 * Which docsets a build includes: dev servers and tests get all of them, `--mode docs` (the web
 * site) the ones with `web = true`, production app builds only `ship = "prod"`.
 * @param {Docset[]} sets @param {{ mode: string; command: "serve" | "build" }} env
 */
export function included(sets, env) {
	if (env.mode === "docs") return sets.filter((s) => s.web);
	if (env.command === "serve" || env.mode === "test") return sets;
	return sets.filter((s) => s.ship === "prod");
}

/** @param {string} dir @returns {string[]} */
const walk = (dir) =>
	fs.existsSync(dir)
		? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".md") ? [path.join(dir, e.name)] : []))
		: [];

/**
 * Pages of a docset, with the text used by search.
 * @param {string} root @param {Docset} set
 * @returns {{ meta: PageMeta; text: string; sections: { id: string; title: string; text: string }[]; body: string }[]}
 */
export function pagesOf(root, set) {
	const base = path.join(root, set.dir);
	return walk(base).map((f) => {
		const { meta, body } = frontMatter(fs.readFileSync(f, "utf8"));
		const id = path.relative(base, f).replace(/\\/g, "/").replace(/\.md$/, "");
		const headings = headingsOf(body).map(({ line: _, ...h }) => h);
		const text = plainText(body);
		return {
			meta: {
				set: set.id,
				id,
				key: `${set.id}/${id}`,
				file: "/" + path.relative(root, f).replace(/\\/g, "/"),
				title: meta.title ?? headings.find((h) => h.level === 1)?.text ?? id,
				section: meta.section ?? "Guides",
				order: Number(meta.order ?? 50),
				kind: meta.kind === "reference" ? "reference" : "manual",
				since: meta.since,
				summary: meta.summary,
				headings,
				words: text.split(/\s+/).length
			},
			text,
			sections: sectionsOf(body),
			body
		};
	});
}

/** Generated page ids a docset has (registry, TOML; API ids are checked by prefix). @param {string} root @param {Docset} set */
export function generatedIds(root, set) {
	const ids = set.reference.map((r) => `reference/${r}`);
	if (fs.existsSync(path.join(root, set.dir, "paths.toml"))) ids.push("learn");
	if (set.schemas) {
		const dir = path.join(root, set.schemas);
		if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith(".schema.json")) ids.push(`toml/${f.replace(/\.schema\.json$/, "")}`);
	}
	return ids;
}

/**
 * `FanwitError` codes thrown in the source, for the errors reference and `!` search.
 * @param {string} root
 * @returns {{ code: string; message: string; hint?: string; docs?: string; file: string; line: number }[]}
 */
export function errorCodes(root) {
	/** @type {Map<string, { code: string; message: string; hint?: string; docs?: string; file: string; line: number }>} */
	const out = new Map();
	const scan = (/** @type {string} */ dir) => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) scan(p);
			else if (/\.(ts|svelte)$/.test(e.name) && !/\.(test|e2e)\.ts$/.test(e.name)) {
				const text = fs.readFileSync(p, "utf8");
				for (const m of text.matchAll(/new FanwitError\(\s*"([A-Z0-9_]+)"\s*,\s*\{([^}]*)\}/g)) {
					if (out.has(m[1])) continue;
					// ponytail: regex, not a parser; template parts show as "…"
					const field = (/** @type {string} */ k) => new RegExp(`${k}:\\s*(["\`])((?:\\\\.|(?!\\1).)*)\\1?`).exec(m[2])?.[2].replace(/\$\{.*$/, "…").replace(/\$\{[^}]*\}/g, "…");
					out.set(m[1], {
						code: m[1],
						message: field("message") ?? "",
						hint: field("hint"),
						docs: field("docs"),
						file: path.relative(root, p).replace(/\\/g, "/"),
						line: text.slice(0, m.index).split("\n").length
					});
				}
			}
		}
	};
	const src = path.join(root, "src");
	if (fs.existsSync(src)) scan(src);
	return [...out.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Tauri commands (`#[tauri::command]`) with their `///` docs, grouped by file with the file's
 * `//!` header: the Rust surface the webview can reach (through the Host, never directly).
 * Arguments are shown as the webview passes them: camelCase, without injected Tauri types.
 * @param {string} root @param {string} dir
 * @returns {{ file: string; about: string; commands: { name: string; args: string[]; returns: string; doc: string; line: number }[] }[]}
 */
export function rustCommands(root, dir) {
	/** @typedef {{ name: string; args: string[]; returns: string; doc: string; line: number }} RustCommand */
	/** @type {{ file: string; about: string; commands: RustCommand[] }[]} */
	const out = [];
	const walk = (/** @type {string} */ d) => {
		if (!fs.existsSync(d)) return;
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith(".rs")) {
				const text = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
				const lines = text.split("\n");
				/** @type {RustCommand[]} */
				const commands = [];
				lines.forEach((l, i) => {
					if (!/^\s*#\[tauri::command/.test(l)) return;
					// the signature can span lines: read to the opening brace
					let sig = "";
					for (let j = i + 1; j < lines.length && !sig.includes("{"); j++) sig += " " + lines[j].trim();
					const m = /fn\s+(\w+)(?:<[^>]*>)?\s*\(([^)]*)\)\s*(?:->\s*([^{]+))?\{/.exec(sig);
					if (!m) return;
					const doc = [];
					for (let j = i - 1; j >= 0 && /^\s*\/\/\//.test(lines[j]); j--) doc.unshift(lines[j].replace(/^\s*\/\/\/\s?/, ""));
					const args = m[2]
						.split(/,(?![^<]*>)/)
						.map((a) => a.trim())
						.filter((a) => a && !/:\s*(?:tauri::)?(AppHandle|WebviewWindow|Window|Webview|State)\b/.test(a))
						.map((a) => a.replace(/^(\w+)/, (n) => n.replace(/_(\w)/g, (_, c) => c.toUpperCase())));
					commands.push({ name: m[1], args, returns: (m[3] ?? "()").trim(), doc: doc.join(" "), line: i + 1 });
				});
				if (commands.length)
					out.push({
						file: path.relative(root, p).replace(/\\/g, "/"),
						about: lines.filter((l) => l.startsWith("//!")).map((l) => l.replace(/^\/\/!\s?/, "")).join(" "),
						commands
					});
			}
		}
	};
	walk(path.join(root, dir));
	return out.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * The `fw` developer CLI's commands, read from its help text (one source: what `fw help` prints).
 * @param {string} root @returns {{ usage: string; text: string }[]}
 */
export function fwCommands(root) {
	const file = path.join(root, "packages/fw/fw.mjs");
	if (!fs.existsSync(file)) return [];
	const help = /const HELP = `([\s\S]*?)`;/.exec(fs.readFileSync(file, "utf8"))?.[1] ?? "";
	/** @type {{ usage: string; text: string }[]} */
	const rows = [];
	for (const l of help.split(/\r?\n/)) {
		const m = /^ {2}(fw .*?)(?:\s{2,}(.*))?$/.exec(l);
		if (m) rows.push({ usage: m[1].trim(), text: m[2]?.trim() ?? "" });
		else if (/^ {3,}\S/.test(l) && rows.length) rows[rows.length - 1].usage +="\n" + l.trim().replace(/\s{2,}.*$/, "");
	}
	return rows;
}

/**
 * A docset's glossary (`docs/<set>/glossary.toml`, `[[term]]` tables with `name`, `aka` and
 * `text`), for the glossary page and `<Term>` hovers.
 * @param {string} root @param {Docset} set @returns {{ name: string; aka: string[]; text: string }[]}
 */
export function glossaryOf(root, set) {
	const t = readToml(root, `${set.dir}/glossary.toml`);
	return (Array.isArray(t.term) ? t.term : []).map((/** @type {any} */ x) => ({ name: String(x.name), aka: Array.isArray(x.aka) ? x.aka.map(String) : [], text: String(x.text ?? "") }));
}

/**
 * A docset's learning paths (`docs/<set>/paths.toml`, `[[path]]` tables with `id`, `title`,
 * `description`, `minutes` and `pages`): an order to read pages in, for a goal.
 * @param {string} root @param {Docset} set
 * @returns {{ id: string; title: string; description: string; minutes: number; pages: string[] }[]}
 */
export function pathsOf(root, set) {
	const t = readToml(root, `${set.dir}/paths.toml`);
	return (Array.isArray(t.path) ? t.path : []).map((/** @type {any} */ p) => ({
		id: String(p.id),
		title: String(p.title ?? p.id),
		description: String(p.description ?? ""),
		minutes: Number(p.minutes ?? 0),
		pages: Array.isArray(p.pages) ? p.pages.map((/** @type {unknown} */ x) => `${set.id}/${x}`) : []
	}));
}

/**
 * `llms.txt` (an index for AI assistants, llmstxt.org) and `llms-full.txt` (every page) for the
 * docs site. Links point at the raw Markdown copied next to the site (`md/<set>/<page>.md`).
 * @param {string} root @param {Docset[]} sets @param {string} base  site URL prefix
 */
export function llmsTxt(root, sets, base = "") {
	const index = [`# ${sets.map((s) => s.title).join(" and ")} documentation`, "", `> Manuals for ${sets.map((s) => `${s.title} ${s.version}`).join(", ")}. Every page is plain Markdown at the links below.`, ""];
	const full = [];
	for (const s of sets) {
		const pages = pagesOf(root, s).sort((a, b) => (s.sections.indexOf(a.meta.section) - s.sections.indexOf(b.meta.section)) || a.meta.order - b.meta.order);
		let section = "";
		for (const p of pages) {
			if (p.meta.section !== section) index.push("", `## ${s.title}: ${(section = p.meta.section)}`, "");
			index.push(`- [${p.meta.title}](${base}/md/${p.meta.key}.md)${p.meta.summary ? `: ${p.meta.summary}` : ""}`);
			full.push(`<!-- ${p.meta.key} -->\n${p.body.trim()}\n`);
		}
	}
	return { index: index.join("\n") + "\n", full: full.join("\n") };
}
