import { expect, test } from "vitest";
import { globToRegExp } from "./vault.svelte";

test("globs match at every depth without rewriting each other", () => {
	const md = globToRegExp("**/*.md");
	expect(md.test("Welcome.md")).toBe(true);
	expect(md.test("daily/2026.md")).toBe(true);
	expect(md.test("a/b/c.md")).toBe(true);
	expect(md.test("a.txt")).toBe(false);
	const all = globToRegExp("**");
	expect(all.test("a/b/c")).toBe(true);
	expect(globToRegExp("daily/*.md").test("daily/x.md")).toBe(true);
	expect(globToRegExp("daily/*.md").test("daily/sub/x.md")).toBe(false);
	expect(globToRegExp("file?.txt").test("file1.txt")).toBe(true);
	expect(globToRegExp("a+b(c).md").test("a+b(c).md")).toBe(true);
});
