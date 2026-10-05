import { expect, test } from "vitest";
import { createTestKernel } from "../testing";
import { WindowService } from "./windows.svelte";

async function windows() {
	const k = await createTestKernel();
	const w = new WindowService(k);
	w.register({ kind: "export", base: "child", view: "t.export", title: "Export" }, "t");
	w.register({ kind: "inspector", base: "panel", view: "t.inspector", focus: "none", web: "virtual" }, "t");
	return w;
}

test("a child window on the web is a modal that locks the page and resolves with its value", async () => {
	const w = await windows();
	const h = await w.open<{ format: string }>("export", { path: "a.md" });
	expect(w.virtual).toHaveLength(1);
	expect(w.virtual[0]).toMatchObject({ modal: true, title: "Export", rect: expect.objectContaining({ w: 520, h: 420 }) });
	expect(w.locked).toBe(true);
	await h.close({ format: "pdf" });
	expect(await h.result).toEqual({ format: "pdf" });
	expect(w.locked).toBe(false);
});

test("opening the same kind with the same props raises the open window", async () => {
	const w = await windows();
	await w.open("inspector", { id: 1 });
	await w.open("inspector", { id: 2 });
	const again = await w.open("inspector", { id: 1 });
	expect(w.virtual).toHaveLength(2);
	expect(w.virtual.find((v) => v.id === again.label)!.z).toBe(Math.max(...w.virtual.map((v) => v.z)));
	expect(w.locked).toBe(false); // focus = none never locks
});

test("unknown kinds fail with a hint", async () => {
	const w = await windows();
	await expect(w.open("nope")).rejects.toMatchObject({ code: "WINDOW_KIND_UNKNOWN", hint: expect.stringContaining("contributes.windows") });
});
