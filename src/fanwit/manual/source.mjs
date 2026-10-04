/**
 * Real files in manual pages: `<Source path="src/fanwit/kernel/disposable.ts" />` shows a file of
 * this repository, so a guide never carries a copy that drifts from the code.
 *
 * - The whole file: a collapsible block; its highlighted code is a lazy module
 *   (`virtual:fw-source/<path>`, vite-plugin.ts), so long files cost nothing until opened.
 * - A slice: `from="export class EventBus"` starts at the first line containing that text, `to="}"`
 *   ends at the next line that starts with it, `until="..."` at the next line containing it
 *   (default: the end of the file). Shown inline.
 *
 * The tags are replaced before mdsvex runs (like ```tikz fences). fw docs check fails when a
 * path or marker no longer exists. Plain JS: svelte.config.js, Vite and fw use it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
// attributes may contain ">" inside their quotes (from="export class Emitter<T>")
const TAG = /^[ \t]*<Source\s+((?:[^>"]|"[^"]*")*?)\/>[ \t]*$/gm;

/** @param {string} p */
export function langOf(p) {
	const ext = /\.([a-z]+)$/.exec(p)?.[1] ?? "";
	return { ts: "ts", svelte: "svelte", rs: "rust", toml: "toml", json: "json", mjs: "js", js: "js", css: "css", html: "html", md: "md", yml: "yaml", yaml: "yaml" }[ext] ?? "text";
}

/**
 * Every <Source> tag in a page, with its attributes.
 * @param {string} markdown
 * @returns {{ match: string, attrs: Record<string, string> }[]}
 */
export function sourceTags(markdown) {
	return [...markdown.replace(/\r\n/g, "\n").matchAll(TAG)].map((m) => ({ match: m[0], attrs: Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]])) }));
}

/**
 * The file's text, or the slice the attributes name, with its first line number.
 * @param {Record<string, string>} attrs @param {string} [root]
 * @returns {{ code: string, first: number, last: number, total: number } | { error: string }}
 */
export function readSource(attrs, root = ROOT) {
	const file = path.join(root, attrs.path ?? "");
	if (!attrs.path || !fs.existsSync(file)) return { error: `${attrs.path ?? "(no path)"} does not exist` };
	const lines = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
	if (!attrs.from) return { code: lines.join("\n"), first: 1, last: lines.length, total: lines.length };
	const start = lines.findIndex((l) => l.includes(attrs.from));
	if (start < 0) return { error: `${attrs.path} has no line containing "${attrs.from}"` };
	let end = lines.length - 1;
	if (attrs.until) {
		const i = lines.findIndex((l, n) => n > start && l.includes(attrs.until));
		if (i < 0) return { error: `${attrs.path}: no line containing "${attrs.until}" after "${attrs.from}"` };
		end = i;
	} else if (attrs.to) {
		const i = lines.findIndex((l, n) => n > start && l.startsWith(attrs.to));
		if (i < 0) return { error: `${attrs.path}: no line starting with "${attrs.to}" after "${attrs.from}"` };
		end = i;
	}
	return { code: lines.slice(start, end + 1).join("\n"), first: start + 1, last: end + 1, total: lines.length };
}

const esc = (/** @type {string} */ s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Svelte markup preprocessor, before mdsvex.
 * @param {(code: string, lang: string, label: string, file?: string) => Promise<string>} codeHtml highlighted block
 * @param {(html: string) => string} inLiteral escapes HTML for a template literal
 */
export const sourcePreprocessor = (codeHtml, inLiteral) => ({
	name: "fanwit-source",
	/** @param {{ content: string; filename?: string }} o */
	markup: async ({ content, filename }) => {
		if (!filename?.endsWith(".md") || !content.includes("<Source")) return;
		let code = content.replace(/\r\n/g, "\n");
		for (const t of sourceTags(code)) {
			const r = readSource(t.attrs);
			let out;
			if ("error" in r) {
				console.warn(`[fanwit-source] ${filename}: ${r.error}`);
				out = `<p class="fw-source-missing">Missing source: ${esc(r.error)}</p>`;
			} else if (t.attrs.from) {
				const label = `${t.attrs.path}:${r.first}${r.last > r.first ? `-${r.last}` : ""}`;
				out = `<div class="fw-source-slice">{@html \`${inLiteral(await codeHtml(r.code, langOf(t.attrs.path), label, label))}\`}</div>`;
			} else {
				const id = JSON.stringify(`virtual:fw-source/${t.attrs.path}`);
				out = `<SourceFile path=${JSON.stringify(t.attrs.path)} lines={${r.total}} open={${t.attrs.open === "true"}} load={() => import(${id})} />`;
			}
			code = code.replace(t.match, () => `\n${out}\n`);
		}
		return { code };
	}
});
