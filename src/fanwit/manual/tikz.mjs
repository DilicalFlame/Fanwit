/**
 * TikZ diagrams in manual pages: a ```tikz fence compiles once with LaTeX to an SVG that is
 * cached in docs/_diagrams/<hash>.svg (committed), so readers, CI and contributors without TeX
 * get the picture, and only a changed diagram is compiled again. Diagrams use
 * docs/_tex/fanwit-diagrams.sty: the specification's colours, styles, logo and wireframe kit.
 *
 * ```tikz caption="The six layers" alt="Six stacked layers from Platform to Features"
 * \node[fwcore] {Kernel};
 * ```
 *
 * The body is a whole environment (`\begin{tikzpicture}`, `\begin{wf}`, `\begin{forest}`) or just
 * TikZ commands, which are wrapped in a tikzpicture. Plain JS: svelte.config.js and fw use it.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const DIAGRAMS = "docs/_diagrams";
const STY = "docs/_tex/fanwit-diagrams.sty";
const FENCE = /^```tikz([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm;

/** Git may check text out with CRLF on Windows: keys must not depend on it. */
const lf = (/** @type {string} */ s) => s.replace(/\r\n/g, "\n");

/**
 * Cache key: the package and the source, so a style change re-renders every diagram.
 * @param {string} source @param {string} [root]
 */
export function diagramKey(source, root = ROOT) {
	return createHash("sha1").update(lf(fs.readFileSync(path.join(root, STY), "utf8"))).update("\0").update(lf(source).trim()).digest("hex").slice(0, 16);
}

/**
 * Every ```tikz block in a Markdown text, with its options (`caption="..."`, `alt="..."`).
 * @param {string} markdown
 * @returns {{ match: string, source: string, opts: Record<string, string> }[]}
 */
export function tikzBlocks(markdown) {
	return [...markdown.replace(/\r\n/g, "\n").matchAll(FENCE)].map((m) => ({
		match: m[0],
		source: m[2],
		opts: Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((o) => [o[1], o[2]]))
	}));
}

/** @param {string} cmd @param {string[]} args @param {string} cwd @returns {Promise<string>} */
const run = (cmd, args, cwd) =>
	new Promise((resolve, reject) =>
		execFile(cmd, args, { cwd, env: { ...process.env, TEXINPUTS: `${path.join(ROOT, "docs/_tex")}${path.delimiter}` }, timeout: 120_000 }, (err, stdout) => (err ? reject(Object.assign(err, { stdout })) : resolve(stdout)))
	);

/**
 * latex + dvisvgm in a temp folder; the error is the first `!` line of the LaTeX log.
 * @param {string} source
 */
async function compile(source) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-tikz-"));
	const body = source.includes("\\begin{") ? source : `\\begin{tikzpicture}\n${source}\n\\end{tikzpicture}`;
	fs.writeFileSync(path.join(dir, "d.tex"), `\\documentclass[border=2pt]{standalone}\n\\usepackage{fanwit-diagrams}\n\\begin{document}\n${body}\n\\end{document}\n`);
	try {
		await run("latex", ["-interaction=nonstopmode", "-halt-on-error", "d.tex"], dir).catch((e) => {
			const log = fs.existsSync(path.join(dir, "d.log")) ? fs.readFileSync(path.join(dir, "d.log"), "utf8") : String(e.message);
			const bang = log.split("\n").findIndex((l) => l.startsWith("!"));
			throw new Error(bang >= 0 ? log.split("\n").slice(bang, bang + 3).join(" ").trim() : `latex failed: ${e.message}`);
		});
		await run("dvisvgm", ["--no-fonts", "--exact-bbox", "--optimize", "-o", "d.svg", "d.dvi"], dir);
		return fs.readFileSync(path.join(dir, "d.svg"), "utf8");
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * Inline-ready SVG: no prolog, ids prefixed with the key (two diagrams on a page would otherwise
 * share glyph ids), scaled to the page width but never past its natural size.
 * @param {string} svg @param {string} key
 */
export function cleanSvg(svg, key) {
	const width = Number(/<svg[^>]*\swidth='([\d.]+)pt'/.exec(svg)?.[1] ?? 0);
	return svg
		.replace(/<\?xml[^>]*>\s*/, "")
		.replace(/<!--[\s\S]*?-->\s*/g, "")
		.replace(/\sid='([^']+)'/g, ` id='d${key}-$1'`)
		.replace(/(xlink:href|href)='#([^']+)'/g, `$1='#d${key}-$2'`)
		.replace(/url\(#([^)]+)\)/g, `url(#d${key}-$1)`)
		.replace(/<svg([^>]*)\swidth='[^']*'\sheight='[^']*'/, `<svg$1 width='100%' style='max-width:${Math.round(width * 1.333)}px'`)
		.replace(/\n+/g, " ")
		.trim();
}

/** @type {Map<string, Promise<{ svg: string, key: string } | { error: string, key: string }>>} */
const pending = new Map();

/**
 * The SVG for one diagram: from the cache, or compiled and cached. `{ error }` when it cannot be
 * rendered (no TeX on this machine, or the diagram does not compile).
 * @param {string} source @param {string} [root]
 * @returns {Promise<{ svg: string, key: string } | { error: string, key: string }>}
 */
export function renderTikz(source, root = ROOT) {
	const key = diagramKey(source, root);
	const file = path.join(root, DIAGRAMS, `${key}.svg`);
	if (fs.existsSync(file)) return Promise.resolve({ svg: fs.readFileSync(file, "utf8"), key });
	let job = pending.get(key);
	if (!job) {
		job = compile(source)
			.then((raw) => {
				const svg = cleanSvg(raw, key);
				fs.mkdirSync(path.dirname(file), { recursive: true });
				fs.writeFileSync(file, svg + "\n");
				return { svg, key };
			})
			.catch((e) => ({ error: e.code === "ENOENT" ? "LaTeX is not installed (latex and dvisvgm on PATH render diagrams)" : String(e.message), key }))
			.finally(() => pending.delete(key));
		pending.set(key, job);
	}
	return job;
}

const esc = (/** @type {string} */ s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Svelte markup preprocessor, before mdsvex: mdsvex rewrites backslashes inside code fences,
 * which TeX cannot survive, so the fences are replaced while the Markdown is still raw.
 * @param {(html: string) => string} escapeSvelte
 */
export const tikzPreprocessor = (escapeSvelte) => ({
	name: "fanwit-tikz",
	/** @param {{ content: string; filename?: string }} o */
	markup: async ({ content, filename }) => {
		if (!filename?.endsWith(".md") || !content.includes("```tikz")) return;
		let code = content.replace(/\r\n/g, "\n");
		for (const b of tikzBlocks(code)) {
			const r = await renderTikz(b.source);
			const caption = b.opts.caption ? `<figcaption>${esc(b.opts.caption)}</figcaption>` : "";
			const label = esc(b.opts.alt ?? b.opts.caption ?? "Diagram");
			const html =
				"svg" in r
					? `<figure class="fw-figure fw-tikz" role="img" aria-label="${label}">${r.svg}${caption}</figure>`
					: `<figure class="fw-figure fw-tikz-missing"><pre><code>${esc(b.source)}</code></pre><figcaption>Diagram not rendered: ${esc(r.error)}</figcaption></figure>`;
			if ("error" in r) console.warn(`[fanwit-tikz] ${filename}: ${r.error}`);
			// its own HTML block (blank lines around a div), so Markdown leaves it alone
			code = code.replace(b.match, () => `\n<div class="fw-diagram">{@html \`${escapeSvelte(html)}\`}</div>\n`);
		}
		return { code };
	}
});
