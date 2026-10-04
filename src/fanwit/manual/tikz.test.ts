import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { cleanSvg, diagramKey, renderTikz, tikzBlocks } from "./tikz.mjs";

test("tikz fences keep their source verbatim and their options", () => {
	const [b] = tikzBlocks('Text\n\n```tikz caption="Layers" alt="Six boxes"\n\\node {a\\\\b};\n```\n');
	expect(b.source).toBe("\\node {a\\\\b};\n");
	expect(b.opts).toEqual({ caption: "Layers", alt: "Six boxes" });
});

test("a cached diagram renders without TeX, and a style change is a new key", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "fw-tikz-test-"));
	fs.mkdirSync(path.join(root, "docs/_tex"), { recursive: true });
	fs.writeFileSync(path.join(root, "docs/_tex/fanwit-diagrams.sty"), "% v1");
	const key = diagramKey("\\draw (0,0) -- (1,1);", root);
	fs.mkdirSync(path.join(root, "docs/_diagrams"));
	fs.writeFileSync(path.join(root, "docs/_diagrams", `${key}.svg`), "<svg/>");
	expect(await renderTikz("\\draw (0,0) -- (1,1);", root)).toEqual({ svg: "<svg/>", key });
	fs.writeFileSync(path.join(root, "docs/_tex/fanwit-diagrams.sty"), "% v2");
	expect(diagramKey("\\draw (0,0) -- (1,1);", root)).not.toBe(key);
	fs.rmSync(root, { recursive: true, force: true });
});

test("SVG ids are scoped to the diagram, so two on one page do not collide", () => {
	const svg = cleanSvg("<?xml version='1.0'?>\n<svg width='100pt' height='50pt' viewBox='0 0 100 50'><path id='g1-28'/><use xlink:href='#g1-28'/></svg>", "abc");
	expect(svg).toBe("<svg width='100%' style='max-width:133px' viewBox='0 0 100 50'><path id='dabc-g1-28'/><use xlink:href='#dabc-g1-28'/></svg>");
});
