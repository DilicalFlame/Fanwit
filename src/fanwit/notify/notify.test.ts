import { expect, test } from "vitest";
import { createMemoryHost } from "../host/memory";
import { FanwitError } from "../kernel/errors";
import { NotifyService, inQuietHours } from "./notify.svelte";

test("quiet hours, including ranges across midnight", () => {
	const at = (h: number, m = 0) => new Date(2026, 9, 3, h, m);
	expect(inQuietHours("22:00-07:00", at(23))).toBe(true);
	expect(inQuietHours("22:00-07:00", at(6, 59))).toBe(true);
	expect(inQuietHours("22:00-07:00", at(12))).toBe(false);
	expect(inQuietHours("13:00-14:00", at(13, 30))).toBe(true);
	expect(inQuietHours("", at(1))).toBe(false);
});

const service = () => new NotifyService(createMemoryHost(), async () => {});

test("a focused window gets a toast; errors and warnings also go to the centre", () => {
	const n = service();
	n.send({ title: "Saved", kind: "success" });
	n.send({ title: "Disk almost full", kind: "warning" });
	expect(n.toasts.map((t) => t.item.title)).toEqual(["Saved", "Disk almost full"]);
	expect(n.items.map((i) => i.title)).toEqual(["Disk almost full"]);
});

test("do not disturb sends everything to the centre instead", () => {
	const n = service();
	n.setDnd(30);
	n.send({ title: "Build finished" });
	expect(n.toasts).toHaveLength(0);
	expect(n.items.map((i) => i.title)).toEqual(["Build finished"]);
});

test("the same notification within five seconds collapses into a counter", () => {
	const n = service();
	n.send({ title: "Synced" });
	n.send({ title: "Synced" });
	expect(n.toasts).toHaveLength(1);
	expect(n.toasts[0].item.count).toBe(2);
});

test("an error shows its hint and offers its docs page", () => {
	const n = service();
	const item = n.error(new FanwitError("NOTES_NOT_FOUND", { message: "No note at a.md.", hint: "Create it first.", docs: "manual://fanwit/guides/vaults" }));
	expect(item).toMatchObject({ title: "No note at a.md.", body: "Create it first.", kind: "error" });
	expect(item?.actions.map((a) => a.command)).toEqual(["manual.open", "dev.logs"]);
	expect(n.error(new FanwitError("CANCELLED", { message: "Cancelled." }))).toBeNull();
});

test("progress reports, then moves to the centre when done", () => {
	const n = service();
	const p = n.progress({ title: "Indexing" });
	p.report(0.5, "half way");
	expect(n.toasts[0].item.progress).toMatchObject({ fraction: 0.5, message: "half way" });
	p.done("Indexed 120 notes");
	expect(n.items[0]).toMatchObject({ title: "Indexed 120 notes", kind: "success" });
	n.dispose();
});
