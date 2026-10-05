import { expect, test } from "vitest";
import { createTestKernel } from "../testing";
import { fuzzy } from "./fuzzy";
import { PaletteService, type PaletteItem } from "./palette-service.svelte";

test("fuzzy matches subsequences and ranks word starts above scattered letters", () => {
	expect(fuzzy("tx", "Toggle sidebar")).toBeNull();
	const starts = fuzzy("ts", "Toggle Sidebar")!;
	expect(starts.positions).toEqual([0, 7]);
	expect(fuzzy("ts", "Toggle Sidebar")!.score).toBeGreaterThan(fuzzy("ts", "Insert table rows")!.score);
	expect(fuzzy("sett", "Settings")!.score).toBeGreaterThan(fuzzy("sett", "Reset theme")!.score);
	// camel humps count as word starts
	expect(fuzzy("of", "openFile")!.positions).toEqual([0, 4]);
});

const item = (label: string): PaletteItem => ({ id: label, label, run: () => {} });

test("the longest matching prefix picks the provider, and only the latest query's results land", async () => {
	const k = await createTestKernel();
	const p = new PaletteService(k);
	let release!: () => void;
	p.register({ prefix: "", title: "Files", provide: (q) => new Promise((r) => (release = () => r([item(`slow ${q}`)]))) });
	p.register({ prefix: ">", title: "Commands", provide: (q) => [item(`cmd ${q}`)] });
	p.register({ prefix: ">>", title: "Recent", provide: () => [item("recent")] });
	p.setQuery("a");
	expect(p.mode?.title).toBe("Files");
	p.setQuery("> theme");
	await Promise.resolve();
	expect(p.mode?.title).toBe("Commands");
	await new Promise((r) => setTimeout(r));
	expect(p.items.map((i) => i.label)).toEqual(["cmd theme"]);
	release(); // the slow "a" result arrives late and is dropped
	await new Promise((r) => setTimeout(r));
	expect(p.items.map((i) => i.label)).toEqual(["cmd theme"]);
	p.setQuery(">> x");
	expect(p.mode?.title).toBe("Recent");
});

test("a command's missing arguments become prompt steps", async () => {
	const k = await createTestKernel();
	const p = new PaletteService(k);
	p.visible = true;
	const answer = p.ask("Set font", [{ name: "family", spec: { type: "enum", options: ["Inter", "Mono"] }, title: "Family" }, { name: "size", spec: { type: "number", min: 8 }, title: "Size" }], { scope: "user" });
	p.setQuery("mo");
	expect(p.items.map((i) => i.label)).toEqual(["Mono"]);
	await p.accept(0);
	p.setQuery("abc");
	await p.accept(0); // not a number: stays on the step
	expect(p.step?.name).toBe("size");
	p.setQuery("14");
	await p.accept(0);
	expect(await answer).toEqual({ scope: "user", family: "Mono", size: 14 });
	expect(p.visible).toBe(false);
});
