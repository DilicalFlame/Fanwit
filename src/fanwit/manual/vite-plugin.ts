/**
 * The docs pipeline as one Vite plugin: discovers docsets (docs/<set>/docset.toml) and exposes
 * one doc model to the app, the docs site and the manual window.
 *
 * - `virtual:fw-docs`: docsets, page metadata and headings, lazy page components, error codes,
 *   TOML schemas.
 * - `virtual:fw-docs/search`: a MiniSearch index of every page and section, built at build time.
 * - `virtual:fw-docs/api`: the TypeDoc API reference per docset with an `api` entry (lazy, cached).
 *
 * Which docsets a build contains is decided here: production builds leave out `ship = "dev"`
 * sets entirely (their pages are never imported), so the FaNWiT manual never ships to users.
 */
import fs from "node:fs";
import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import MiniSearch from "minisearch";
import { docsets, errorCodes, fwCommands, glossaryOf, included, llmsTxt, pagesOf, pathsOf, rustCommands, type Docset } from "./discover.mjs";
import { execFile } from "node:child_process";
import { SEARCH_OPTIONS } from "./search-options";
import { langOf, readSource } from "./source.mjs";
import { codeHtml } from "./mdsvex.mjs";

const ID = "virtual:fw-docs";
const SEARCH = "virtual:fw-docs/search";
const API = "virtual:fw-docs/api";
const SOURCE = "virtual:fw-source/";
const SOURCE_SUFFIX = ".fwsrc.js";
const ids = [ID, SEARCH, API];

export function fanwitDocs(): Plugin {
	let root = process.cwd();
	let env: { mode: string; command: "serve" | "build" } = { mode: "development", command: "serve" };
	let api: Promise<string> | null = null;
	let ssr = false;
	const sets = (): Docset[] => included(docsets(root), env);

	/** `llms.txt`, `llms-full.txt` and `md/<set>/<page>.md`, relative to the site root. */
	function rawFiles(): Record<string, string> {
		const list = sets();
		const { index, full } = llmsTxt(root, list, ".");
		const out: Record<string, string> = { "llms.txt": index, "llms-full.txt": full };
		for (const s of list) for (const p of pagesOf(root, s)) out[`md/${p.meta.key}.md`] = `# ${p.meta.title}\n\n${p.body.replace(/^#\s+.*\n+/, "")}`;
		return out;
	}

	function model() {
		const list = sets();
		const pages = list.flatMap((s) => pagesOf(root, s).map((p) => p.meta));
		const loaders = pages.map((p) => `${JSON.stringify(p.key)}: () => import(${JSON.stringify(p.file)})`).join(",\n");
		const schemas: Record<string, { name: string; schema: unknown }[]> = {};
		for (const s of list) {
			if (!s.schemas) continue;
			const dir = path.join(root, s.schemas);
			if (!fs.existsSync(dir)) continue;
			schemas[s.id] = fs
				.readdirSync(dir)
				.filter((f) => f.endsWith(".schema.json"))
				.map((f) => ({ name: f.replace(/\.schema\.json$/, ""), schema: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }));
		}
		const errors = list.some((s) => s.reference.includes("errors")) ? errorCodes(root) : [];
		const lists = (page: string) => list.some((s) => s.reference.includes(page));
		// read from the repo at build time: glossaries, the fw CLI's help, Rust commands
		const glossary = Object.fromEntries(list.map((s) => [s.id, glossaryOf(root, s)]));
		const rust = Object.fromEntries(list.filter((s) => s.rust && s.reference.includes("rust-commands")).map((s) => [s.id, rustCommands(root, s.rust!)]));
		const fwCli = lists("fw-cli") ? fwCommands(root) : [];
		const paths = Object.fromEntries(list.map((s) => [s.id, pathsOf(root, s)]));
		return [
			`export const paths = ${JSON.stringify(paths)};`,
			`export const glossary = ${JSON.stringify(glossary)};`,
			`export const rust = ${JSON.stringify(rust)};`,
			`export const fwCli = ${JSON.stringify(fwCli)};`,
			// the docs site's version folder (fw docs build --version): "1.2.0", "next", or "" when unversioned
			`export const siteVersion = ${JSON.stringify(process.env.FW_DOCS_VERSION ?? "")};`,
			`export const docsets = ${JSON.stringify(list)};`,
			`export const pages = ${JSON.stringify(pages)};`,
			`export const loaders = {\n${loaders}\n};`,
			`export const schemas = ${JSON.stringify(schemas)};`,
			`export const errors = ${JSON.stringify(errors)};`,
			`export const buildMode = ${JSON.stringify(env.mode === "docs" ? "docs" : env.command === "serve" ? "dev" : "prod")};`,
			`export const loadSearch = () => import(${JSON.stringify(SEARCH)});`,
			`export const loadApi = () => import(${JSON.stringify(API)});`
		].join("\n");
	}

	function search() {
		const ms = new MiniSearch(SEARCH_OPTIONS);
		for (const s of sets()) {
			for (const p of pagesOf(root, s)) {
				const base = { set: s.id, key: p.meta.key, page: p.meta.title, section: p.meta.section, kind: p.meta.kind };
				const intro = p.sections.length ? p.text.slice(0, 600) : p.text;
				ms.add({ ...base, id: p.meta.key, type: "page", title: p.meta.title, text: intro, anchor: "" });
				for (const sec of p.sections) ms.add({ ...base, id: `${p.meta.key}#${sec.id}`, type: "section", title: sec.title, text: sec.text, anchor: sec.id });
			}
		}
		return `export default ${JSON.stringify(JSON.stringify(ms))};`;
	}

	function apiModule() {
		api ??= (async () => {
			const out: Record<string, unknown> = {};
			for (const s of sets()) if (s.api) out[s.id] = await apiOf(root, s.api);
			return `export default ${JSON.stringify(out)};`;
		})();
		return api;
	}

	function invalidate(server: ViteDevServer, which: string[]) {
		for (const id of which) {
			const m = server.moduleGraph.getModuleById("\0" + id);
			if (m) server.moduleGraph.invalidateModule(m);
		}
	}

	return {
		name: "fanwit-docs",
		enforce: "pre",
		configResolved(c) {
			root = c.root;
			env = { mode: c.mode, command: c.command };
			ssr = !!c.build.ssr;
		},
		// the docs site also ships llms.txt and every page as raw Markdown (for AI assistants)
		generateBundle() {
			if (env.mode !== "docs" || ssr) return;
			for (const [fileName, source] of Object.entries(rawFiles())) this.emitFile({ type: "asset", fileName, source });
		},
		resolveId(id) {
			if (ids.includes(id)) return "\0" + id;
			// a neutral suffix: an id ending in .json or .css would be claimed by Vite's own plugins
			if (id.startsWith(SOURCE)) return "\0" + id + SOURCE_SUFFIX;
		},
		load(id) {
			if (id === "\0" + ID) return model();
			if (id === "\0" + SEARCH) return search();
			if (id === "\0" + API) return apiModule();
			// a repository file for <Source>: highlighted, and reloaded when the file changes
			if (id.startsWith("\0" + SOURCE)) {
				const file = id.slice(SOURCE.length + 1, -SOURCE_SUFFIX.length);
				const r = readSource({ path: file }, root);
				if ("error" in r) return `export default ${JSON.stringify(`<p>${r.error}</p>`)};`;
				this.addWatchFile(path.join(root, file));
				return codeHtml(r.code, langOf(file), file, file).then((html) => `export default ${JSON.stringify(html)};`);
			}
		},
		configureServer(server) {
			const docs = path.join(root, "docs");
			const src = path.join(root, "src");
			const onChange = (file: string, structural: boolean) => {
				if (file.startsWith(docs) && (file.endsWith(".md") || file.endsWith(".toml"))) {
					invalidate(server, [ID, SEARCH]);
					// new or removed pages change the navigation: reload; edits hot update in place
					if (structural || file.endsWith("docset.toml")) server.ws.send({ type: "full-reload" });
				} else if (file.startsWith(src) && /\.(ts|mjs)$/.test(file) && !/\.test\.ts$/.test(file)) {
					api = null;
					invalidate(server, [API]);
				}
			};
			server.watcher.add(docs);
			server.middlewares.use((req, res, next) => {
				const url = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\//, "");
				if (!/^(llms(-full)?\.txt$|md\/)/.test(url)) return next();
				const file = rawFiles()[url];
				if (file === undefined) return next();
				res.setHeader("content-type", "text/markdown; charset=utf-8");
				res.end(file);
			});
			server.watcher.on("change", (f) => onChange(path.resolve(f), false));
			server.watcher.on("add", (f) => onChange(path.resolve(f), true));
			server.watcher.on("unlink", (f) => onChange(path.resolve(f), true));
		}
	};
}

/** Newest modification time of the sources an API entry can reach (its folder, recursively). */
function stamp(dir: string): number {
	let max = 0;
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) max = Math.max(max, stamp(p));
		else if (/\.(ts|mjs|svelte)$/.test(e.name)) max = Math.max(max, fs.statSync(p).mtimeMs);
	}
	return max;
}

/**
 * The TypeDoc API of one entry. TypeDoc runs in a child process (seconds of CPU that would
 * otherwise freeze the dev server) and its result is cached on disk until a source file changes.
 */
async function apiOf(root: string, entry: string): Promise<unknown[]> {
	const cacheDir = path.join(root, "node_modules", ".cache", "fanwit-docs");
	const cache = path.join(cacheDir, `api-${entry.replace(/[^\w]+/g, "_")}.json`);
	const key = String(stamp(path.join(root, path.dirname(entry))));
	try {
		const c = JSON.parse(fs.readFileSync(cache, "utf8"));
		if (c.key === key) return c.symbols;
	} catch {
		/* no cache yet */
	}
	const json = await new Promise<string>((resolve, reject) =>
		execFile(process.execPath, [path.join(root, "src/fanwit/manual/api.mjs"), root, entry], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)))
	).catch((e: Error) => {
		console.warn(`[fanwit-docs] API reference for ${entry} failed: ${e.message}`);
		return "";
	});
	if (!json) return [];
	const { symbols } = JSON.parse(json);
	fs.mkdirSync(cacheDir, { recursive: true });
	fs.writeFileSync(cache, JSON.stringify({ key, symbols }));
	return symbols;
}
