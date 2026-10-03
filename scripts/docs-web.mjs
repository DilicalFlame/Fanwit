#!/usr/bin/env node
/**
 * `pnpm docs`: the manual on the web, separate from the app. Serves docs/**\/*.md and renders them in the
 * browser with marked (full GFM: tables, nested lists, raw HTML), independent of the in-app renderer.
 * Generated reference pages (reference/*) need the live registries, so they stay in the app.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";

const root = path.resolve(import.meta.dirname, "../docs");
const port = Number(process.env.PORT ?? 3001);

const pages = () => {
	const out = [];
	const walk = (d) => {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith(".md")) {
				const text = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
				const meta = Object.fromEntries((/^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "").split("\n").map((l) => l.split(/:\s*/, 2)).filter((x) => x.length === 2));
				const id = path.relative(root, p).replace(/\\/g, "/").replace(/\.md$/, "");
				out.push({ id, title: meta.title ?? /^#\s+(.*)$/m.exec(text)?.[1] ?? id, section: meta.section ?? "Guides", order: Number(meta.order ?? 50) });
			}
		}
	};
	walk(root);
	const S = ["Getting started", "Concepts", "Guides", "Recipes", "Operations"];
	return out.sort((a, b) => S.indexOf(a.section) - S.indexOf(b.section) || a.order - b.order || a.title.localeCompare(b.title));
};

const shell = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FaNWiT manual</title>
<style>
:root{color-scheme:light dark;--fg:#1f2328;--bg:#fff;--muted:#59636e;--line:#d1d9e0;--soft:#f6f8fa;--link:#0969da}
@media (prefers-color-scheme:dark){:root{--fg:#e6edf3;--bg:#0d1117;--muted:#9198a1;--line:#3d444d;--soft:#151b23;--link:#4493f8}}
*{box-sizing:border-box}body{margin:0;display:flex;font:15px/1.6 system-ui,sans-serif;color:var(--fg);background:var(--bg)}
nav{width:260px;flex:none;height:100vh;position:sticky;top:0;overflow:auto;padding:16px;border-right:1px solid var(--line);background:var(--soft)}
nav h4{margin:16px 0 4px;font-size:12px;text-transform:uppercase;color:var(--muted)}nav a{display:block;padding:2px 8px;border-radius:4px;color:var(--fg);text-decoration:none}
nav a.on,nav a:hover{background:var(--line)}main{flex:1;min-width:0;max-width:960px;padding:24px 40px}a{color:var(--link)}
table{border-collapse:collapse;display:block;overflow:auto;margin:16px 0}th,td{border:1px solid var(--line);padding:6px 12px;text-align:left}tr:nth-child(2n){background:var(--soft)}
code{font:13px ui-monospace,monospace;background:var(--soft);padding:2px 4px;border-radius:4px}pre{background:var(--soft);padding:12px;border-radius:6px;overflow:auto}pre code{padding:0}
blockquote{margin:0;padding:0 16px;border-left:4px solid var(--line);color:var(--muted)}
@media (max-width:720px){body{display:block}nav{width:auto;height:auto;position:static}main{padding:16px}}
</style></head><body><nav id="nav"></nav><main id="doc"></main>
<script src="https://cdn.jsdelivr.net/npm/marked@15/marked.min.js"></script>
<script>
let list = [];
const resolve = (id) => list.find((p) => p.id === id) ?? list.find((p) => p.id === "guides/" + id);
async function show() {
	const [id, anchor] = decodeURIComponent(location.hash.slice(1)).split("#");
	const page = resolve(id) ?? list[0];
	const md = (await (await fetch("/md/" + page.id)).text()).replace(/\\r\\n/g, "\\n").replace(/^---\\n[\\s\\S]*?\\n---\\n?/, "");
	const doc = document.getElementById("doc");
	doc.innerHTML = marked.parse(md);
	for (const h of doc.querySelectorAll("h1,h2,h3,h4")) h.id = h.textContent.toLowerCase().replace(/[^\\w]+/g, "-").replace(/^-|-$/g, "");
	for (const a of doc.querySelectorAll('a[href^="manual://"]')) {
		const [target, frag] = a.getAttribute("href").slice(9).split("#");
		const p = resolve(target);
		if (p) a.href = "#" + p.id + (frag ? "#" + frag : "");
		else a.title = "Generated page: open it in the app manual";
	}
	for (const a of document.querySelectorAll("nav a")) a.classList.toggle("on", a.dataset.id === page.id);
	document.title = page.title + " · FaNWiT manual";
	anchor ? document.getElementById(anchor)?.scrollIntoView() : scrollTo(0, 0);
}
fetch("/pages.json").then((r) => r.json()).then((l) => {
	list = l;
	let html = "", section = "";
	for (const p of l) {
		if (p.section !== section) html += "<h4>" + (section = p.section) + "</h4>";
		html += '<a href="#' + p.id + '" data-id="' + p.id + '">' + p.title.replace(/</g, "&lt;") + "</a>";
	}
	document.getElementById("nav").innerHTML = html;
	addEventListener("hashchange", show);
	show();
});
</script></body></html>`;

http
	.createServer((req, res) => {
		const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
		if (url === "/") return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(shell);
		if (url === "/pages.json") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(pages()));
		const file = path.resolve(root, `${url.replace(/^\/md\//, "")}.md`);
		if (url.startsWith("/md/") && file.startsWith(root + path.sep) && fs.existsSync(file)) return res.writeHead(200, { "content-type": "text/markdown; charset=utf-8" }).end(fs.readFileSync(file));
		res.writeHead(404).end("not found");
	})
	.listen(port, () => {
		const url = `http://localhost:${port}`;
		console.log(`manual on ${url} (Ctrl+C to stop)`);
		exec(process.platform === "win32" ? `start "" ${url}` : `${process.platform === "darwin" ? "open" : "xdg-open"} ${url}`);
	});
