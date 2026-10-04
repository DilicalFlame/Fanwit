import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { readSource, sourceTags } from "./source.mjs";

test("Source tags are found, even with > inside an attribute", () => {
	const tags = sourceTags('Text\n\n<Source path="a.ts" from="export class Emitter<T>" to="}" />\n\n<Source path="b.ts" />\n');
	expect(tags.map((t) => t.attrs)).toEqual([{ path: "a.ts", from: "export class Emitter<T>", to: "}" }, { path: "b.ts" }]);
});

test("a slice runs from its marker to the line that starts with to, or contains until", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "fw-source-"));
	fs.writeFileSync(path.join(root, "f.ts"), "import x;\nexport class A {\n\tm() {}\n}\nconst tail = 1;\n");
	expect(readSource({ path: "f.ts", from: "export class A", to: "}" }, root)).toEqual({ code: "export class A {\n\tm() {}\n}", first: 2, last: 4, total: 5 });
	expect(readSource({ path: "f.ts", from: "import", until: "m()" }, root)).toMatchObject({ first: 1, last: 3 });
	expect(readSource({ path: "f.ts" }, root)).toMatchObject({ first: 1, last: 5, total: 5 });
	expect(readSource({ path: "f.ts", from: "nothing" }, root)).toHaveProperty("error");
	expect(readSource({ path: "gone.ts" }, root)).toHaveProperty("error");
	fs.rmSync(root, { recursive: true, force: true });
});
