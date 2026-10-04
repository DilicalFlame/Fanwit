import { expect, test } from "vitest";
import { mergeToml } from "./toml-merge";

test("web TOML writes keep comments and formatting", async () => {
	const src = "# Live layout\nversion = 1\n\n[node.center] # main area\ntype = \"split\"\nsizes = [0.6, 0.4]\ngone = 3\n";
	const out = await mergeToml(src, { version: 1, node: { center: { type: "split", sizes: [0.5, 0.5] } }, bind: [{ key: "mod+e", command: "x" }] });
	expect(out).toContain("# Live layout");
	expect(out).toContain("# main area");
	expect(out).toContain("sizes = [0.5, 0.5]");
	expect(out).not.toContain("gone");
	expect(out).toContain("[[bind]]");
	expect(await mergeToml("", { a: 1 })).toBe("a = 1\n");
});
