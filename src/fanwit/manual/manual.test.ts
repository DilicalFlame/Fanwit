import { describe, expect, it } from "vitest";
import { frontMatter, headingsOf, included, resolveLink, docsets, pagesOf, generatedIds, type Docset } from "./discover.mjs";
import { parseQuery } from "./search";
import { catalog, titleOf } from "./docs";
import { render } from "./markdown";

const set = (id: string, ship: "dev" | "prod", web: boolean) => ({ id, ship, web }) as Docset;

describe("discovery", () => {
	it("reads flat front matter", () => {
		const { meta, body } = frontMatter("---\ntitle: Sync\nsection: Guides\norder: 3\n---\n# Sync\n");
		expect(meta).toEqual({ title: "Sync", section: "Guides", order: "3" });
		expect(body).toBe("# Sync\n");
	});

	it("gives headings the ids the page view assigns, ignoring code fences", () => {
		const hs = headingsOf("# Top\n## Set `up`\n```md\n## not a heading\n```\n## Set up\n### [Linked](manual://x)");
		expect(hs.map((h) => h.id)).toEqual(["top", "set-up", "set-up-1", "linked"]);
	});

	it("keeps dev only docsets out of production builds", () => {
		const sets = [set("fanwit", "dev", true), set("app", "prod", false)];
		expect(included(sets, { mode: "development", command: "serve" }).map((s) => s.id)).toEqual(["fanwit", "app"]);
		expect(included(sets, { mode: "production", command: "build" }).map((s) => s.id)).toEqual(["app"]);
		expect(included(sets, { mode: "docs", command: "build" }).map((s) => s.id)).toEqual(["fanwit"]);
	});

	it("finds the repository's docsets and pages", () => {
		const sets = docsets(process.cwd());
		expect(sets.map((s) => s.id)).toEqual(expect.arrayContaining(["app", "fanwit"]));
		const fanwit = sets.find((s) => s.id === "fanwit")!;
		expect(pagesOf(process.cwd(), fanwit).some((p) => p.meta.key === "fanwit/guides/manual")).toBe(true);
		expect(generatedIds(process.cwd(), fanwit)).toContain("reference/commands");
	});
});

describe("links", () => {
	const keys = new Set(["fanwit/guides/layout", "fanwit/getting-started", "app/welcome", "app/guides/layout"]);
	it("resolves docset qualified links", () => expect(resolveLink("manual://app/welcome#where", keys)).toEqual({ key: "app/welcome", anchor: "where" }));
	it("resolves bare ids in the linking docset first, then FaNWiT's", () => {
		expect(resolveLink("layout#views", keys)).toEqual({ key: "fanwit/guides/layout", anchor: "views" });
		expect(resolveLink("layout", keys, "app")).toEqual({ key: "app/guides/layout", anchor: undefined });
	});
	it("opens a docset's start page for its bare id", () => expect(resolveLink("fanwit", keys)?.key).toBe("fanwit/getting-started"));
	it("returns null for unknown pages", () => expect(resolveLink("nope", keys)).toBeNull());
});

describe("generated page markdown", () => {
	it("renders tables, with escaped pipes inside cells", () => {
		const html = render("| Command | Does |\n|---|:--:|\n| `fw a <x\\|y>` | text |\n").html;
		expect(html).toContain("<th>Command</th><th>Does</th>");
		expect(html).toContain("<td><code>fw a &lt;x|y&gt;</code></td><td>text</td>");
	});
});

describe("search", () => {
	it("reads the mode prefix", () => {
		expect(parseQuery("@ dispatch")).toEqual({ type: "api", q: "dispatch" });
		expect(parseQuery(">theme")).toEqual({ type: "command", q: "theme" });
		expect(parseQuery("layout preset")).toEqual({ q: "layout preset" });
	});
});

describe("catalog", () => {
	it("adds generated reference pages to the docsets that list them", () => {
		const pages = catalog();
		expect(pages.find((p) => p.key === "fanwit/reference/commands")?.kind).toBe("reference");
		expect(pages.find((p) => p.key === "fanwit/toml/keys")?.source).toBe("generated");
		expect(titleOf("fanwit/api/defineModule")).toBe("defineModule");
		expect(titleOf("fanwit/reference/errors")).toBe("Error codes");
	});
});
