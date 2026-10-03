/**
 * Small Markdown renderer for the manual: headings (with ids), paragraphs, lists, block quotes,
 * fenced code, tables, inline code, bold, italic and links. All text is escaped; no raw HTML.
 * Code blocks fenced as ```fanwit-run render a Run button that executes a real command.
 */
export interface Heading {
	level: number;
	text: string;
	id: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const slug = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");

function inline(s: string): string {
	let out = esc(s);
	out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
	out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
	out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
		const safe = /^(https?:|manual:|#)/.test(href) ? href : "#";
		return `<a href="${safe}" data-href="${safe}">${text}</a>`;
	});
	return out;
}

export function render(md: string): { html: string; headings: Heading[] } {
	const lines = md.replace(/\r\n/g, "\n").split("\n");
	const out: string[] = [];
	const headings: Heading[] = [];
	let i = 0;
	let runId = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (/^```/.test(line)) {
			const lang = line.slice(3).trim();
			const body: string[] = [];
			i++;
			while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
			i++;
			if (lang === "fanwit-run") {
				const [cmd, ...rest] = body.join("\n").trim().split(/\s+/);
				const args = rest.join(" ") || "{}";
				out.push(`<div class="fw-run"><pre><code>${esc(body.join("\n"))}</code></pre><button data-run="${esc(cmd)}" data-args="${esc(args)}" data-run-id="${runId++}">Run</button></div>`);
			} else out.push(`<pre data-lang="${esc(lang)}"><code>${esc(body.join("\n"))}</code></pre>`);
			continue;
		}
		const h = /^(#{1,4})\s+(.*)$/.exec(line);
		if (h) {
			const id = slug(h[2]);
			headings.push({ level: h[1].length, text: h[2], id });
			out.push(`<h${h[1].length} id="${id}">${inline(h[2])}</h${h[1].length}>`);
			i++;
			continue;
		}
		if (/^\|/.test(line) && /^\|[\s:-|]+\|$/.test(lines[i + 1] ?? "")) {
			const row = (l: string) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
			const head = row(line);
			i += 2;
			const rows: string[][] = [];
			while (i < lines.length && /^\|/.test(lines[i])) rows.push(row(lines[i++]));
			out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
			continue;
		}
		if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
			const ordered = /^\s*\d+\./.test(line);
			const items: string[] = [];
			while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
			out.push(`<${ordered ? "ol" : "ul"}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
			continue;
		}
		if (/^>\s?/.test(line)) {
			const q: string[] = [];
			while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
			out.push(`<blockquote>${inline(q.join(" "))}</blockquote>`);
			continue;
		}
		if (!line.trim()) {
			i++;
			continue;
		}
		const para: string[] = [];
		while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*([-*]|\d+\.)\s|>|\|)/.test(lines[i])) para.push(lines[i++]);
		if (!para.length) para.push(lines[i++]);
		out.push(`<p>${inline(para.join(" "))}</p>`);
	}
	return { html: out.join("\n"), headings };
}

/** Front matter: `---\ntitle: X\norder: 3\nsection: Guides\n---`. */
export function frontMatter(md: string): { meta: Record<string, string>; body: string } {
	const m = /^---\n([\s\S]*?)\n---\n?/.exec(md.replace(/\r\n/g, "\n"));
	if (!m) return { meta: {}, body: md };
	const meta = Object.fromEntries(m[1].split("\n").map((l) => l.split(/:\s*/, 2)).filter((p) => p.length === 2)) as Record<string, string>;
	return { meta, body: md.slice(m[0].length) };
}
