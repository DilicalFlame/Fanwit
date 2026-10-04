/**
 * The parts of docs discovery that also run in the browser: heading ids, front matter, search
 * text and `manual://` link resolution. No Node imports here (discover.mjs has those).
 */

/** @param {string} s */
export const slug = (s) =>
	s
		.toLowerCase()
		.replace(/<[^>]+>/g, "")
		.replace(/[^\w]+/g, "-")
		.replace(/^-|-$/g, "");

/** Heading text as the reader sees it: no inline code ticks, emphasis or link targets. */
const plainHeading = (/** @type {string} */ s) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "").trim();

/**
 * Headings (h1 to h4) outside code fences, with the same ids the page view assigns (duplicates
 * get -1, -2 suffixes).
 * @param {string} md
 */
export function headingsOf(md) {
	/** @type {{ level: number; text: string; id: string; line: number }[]} */
	const out = [];
	const seen = new Map();
	let fence = false;
	md.split("\n").forEach((line, i) => {
		if (/^\s*(```|~~~)/.test(line)) fence = !fence;
		if (fence) return;
		const m = /^(#{1,4})\s+(.*?)\s*#*$/.exec(line);
		if (!m) return;
		const text = plainHeading(m[2]);
		const base = slug(text);
		const n = seen.get(base) ?? 0;
		seen.set(base, n + 1);
		out.push({ level: m[1].length, text, id: n ? `${base}-${n}` : base, line: i + 1 });
	});
	return out;
}

/** `---\nkey: value\n---` front matter (flat keys only). @param {string} md */
export function frontMatter(md) {
	const text = md.replace(/\r\n/g, "\n");
	const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
	if (!m) return { meta: /** @type {Record<string, string>} */ ({}), body: text };
	const meta = Object.fromEntries(
		m[1]
			.split("\n")
			.map((l) => /^([\w-]+):\s*(.*)$/.exec(l))
			.filter((x) => x !== null)
			.map((x) => [x[1], x[2].replace(/^["']|["']$/g, "")])
	);
	return { meta, body: text.slice(m[0].length) };
}

/** Searchable text: markdown syntax removed, code kept (people search for API names). @param {string} md */
export const plainText = (md) =>
	md
		.replace(/^\s*(```|~~~).*$/gm, "")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/[#>*_`|]/g, " ")
		.replace(/[ \t]+/g, " ")
		.trim();

/**
 * Sections for search: the text under each h2/h3, so a hit can jump to its heading.
 * @param {string} body
 */
export function sectionsOf(body) {
	const hs = headingsOf(body);
	const lines = body.split("\n");
	return hs
		.filter((h) => h.level > 1 && h.level < 4)
		.map((h, i, all) => {
			const end = all[i + 1]?.line ?? lines.length + 1;
			return { id: h.id, title: h.text, text: plainText(lines.slice(h.line, end - 1).join("\n")) };
		});
}

/**
 * Resolve a `manual://` target to a page key. `set/page` names the docset; a bare `page` tries the
 * linking docset first, then FaNWiT's, then any (so old links like `manual://layout#views` work).
 * A page id may omit `guides/`.
 * @param {string} target  without the scheme, with or without #anchor
 * @param {Set<string>} keys  every page key (`set/id`)
 * @param {string} [from]  docset of the page or code that links
 * @returns {{ key: string; anchor?: string } | null}
 */
export function resolveLink(target, keys, from = "fanwit") {
	const [ref, anchor] = target.replace(/^manual:\/\//, "").split("#");
	const candidates = (/** @type {string} */ id) => [id, `guides/${id}`];
	const sets = [...new Set([...keys].map((k) => k.split("/")[0]))];
	const first = ref.split("/")[0];
	/** @type {string[]} */
	let tries;
	if (sets.includes(first) && ref.includes("/")) tries = candidates(ref.slice(first.length + 1)).map((id) => `${first}/${id}`);
	else if (sets.includes(first)) tries = [`${first}/index`, `${first}/getting-started`, `${first}/welcome`];
	else tries = [from, "fanwit", ...sets].flatMap((s) => candidates(ref).map((id) => `${s}/${id}`));
	for (const t of tries) if (keys.has(t)) return { key: t, anchor: anchor || undefined };
	// generated API pages are known only after TypeDoc runs; accept them by prefix
	if (/(^|\/)api\//.test(ref)) return { key: sets.includes(first) ? ref : `${from}/${ref}`, anchor: anchor || undefined };
	return null;
}
