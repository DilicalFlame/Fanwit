/**
 * mdsvex for the manual: Markdown pages under docs/ compile to Svelte components, so a page can
 * use components (diagrams, live windows) next to prose. Code is highlighted at build time by
 * Shiki with light and dark colours as CSS variables, so reading themes recolour it without a
 * runtime highlighter. Used from svelte.config.js (plain JS, hence .mjs).
 */
import { mdsvex, escapeSvelte } from "mdsvex";
import { createHighlighter } from "shiki";
import { tikzPreprocessor } from "./tikz.mjs";

const LANGS = ["ts", "js", "svelte", "toml", "rust", "json", "jsonc", "sh", "bash", "powershell", "css", "html", "md", "yaml", "diff", "xml", "ini"];
/** Reading themes pick one of these with `--shiki-light` / `--shiki-dark` (see reading.css). */
export const CODE_THEMES = { light: "github-light", dark: "github-dark" };

/** @type {Promise<import("shiki").Highlighter> | null} */
let highlighter = null;
const esc = (/** @type {string} */ s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Highlight one fenced block. ```fanwit-run fences become a Run button that executes a real
 * command (handled by the page view); every block gets a Copy button.
 * @param {string} code @param {string | null | undefined} lang
 */
export async function highlight(code, lang) {
	let html;
	if (lang === "fanwit-run") {
		const [cmd, ...rest] = code.trim().split(/\s+/);
		const args = rest.join(" ") || "{}";
		html = `<div class="fw-run"><pre><code>${esc(code.trim())}</code></pre><button type="button" class="fw-run-btn" data-run="${esc(cmd)}" data-args="${esc(args)}">Run</button></div>`;
	} else {
		highlighter ??= createHighlighter({ themes: Object.values(CODE_THEMES), langs: LANGS });
		const h = await highlighter;
		const l = lang && h.getLoadedLanguages().includes(lang) ? lang : "text";
		const pre = h.codeToHtml(code, { lang: l, themes: CODE_THEMES, defaultColor: false });
		html = `<div class="fw-code" data-lang="${esc(lang ?? "")}">${lang ? `<span class="fw-code-lang">${esc(lang)}</span>` : ""}<button type="button" class="fw-copy" data-copy aria-label="Copy code">Copy</button>${pre}</div>`;
	}
	return `{@html \`${escapeSvelte(html)}\`}`;
}

/** The preprocessors for svelte.config.js: TikZ diagrams, mdsvex, then Svelte 5 syntax for its front matter script. */
export const manualMarkdown = () => [
	tikzPreprocessor(escapeSvelte),
	mdsvex({
		extensions: [".md"],
		highlight: { highlighter: highlight },
		smartypants: { dashes: "oldschool" }
	}),
	{
		name: "fanwit-md-module",
		/** @param {{ content: string; filename?: string }} o */
		markup: ({ content, filename }) => (filename?.endsWith(".md") ? { code: autoImport(content.replace('<script context="module">', "<script module>")) } : undefined)
	}
];

/** Components every page can use without importing them (src/fanwit/manual/components). */
export const COMPONENTS = ["Callout", "Steps", "Tabs", "FileTree", "Keys", "Term", "Api", "Diagram", "CommandPipeline", "LayoutPreview", "LiveToml", "Playground", "Check", "Levels"];

/**
 * Import the manual components a page uses. Code samples cannot match: highlighted code is
 * escaped (`&lt;Callout`) by then.
 * @param {string} code
 */
function autoImport(code) {
	const used = COMPONENTS.filter((c) => new RegExp(`<${c}[\\s/>]`).test(code));
	if (!used.length) return code;
	const line = `import { ${used.join(", ")} } from "$fanwit/manual/components";`;
	const instance = /<script(?![^>]*\bmodule\b)(?![^>]*context=)[^>]*>/.exec(code);
	return instance ? code.replace(instance[0], `${instance[0]}\n${line}`) : `<script>${line}</script>\n${code}`;
}
