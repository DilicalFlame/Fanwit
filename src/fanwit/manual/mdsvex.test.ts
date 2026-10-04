import { expect, test } from "vitest";
import { highlight } from "./mdsvex.mjs";

test("backslashes in code survive the template literal the page is compiled into", async () => {
	const code = 'println!("\\"{x}\\" \\\\ \\n");';
	const out = await highlight(code, "rust");
	// evaluate the literal as the compiled page would, and compare the text that reaches the reader
	const html = new Function("return `" + out.slice("{@html `".length, -"`}".length) + "`")() as string;
	const text = html.replace(/<[^>]+>/g, "").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
	expect(text).toContain(code);
});
