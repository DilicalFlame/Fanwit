import { expect, test } from "vitest";
import { extractLinks } from "./activate";

test("extracts wikilinks and relative Markdown links", () => {
	expect(extractLinks("See [[b]] and [[c.md|C]] and [x](./d.md) but not [y](https://e.com/f.md)").sort()).toEqual(["b.md", "c.md", "d.md"]);
});
