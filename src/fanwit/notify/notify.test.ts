import { expect, test } from "vitest";
import { inQuietHours } from "./notify.svelte";

test("quiet hours, including ranges across midnight", () => {
	const at = (h: number, m = 0) => new Date(2026, 9, 3, h, m);
	expect(inQuietHours("22:00-07:00", at(23))).toBe(true);
	expect(inQuietHours("22:00-07:00", at(6, 59))).toBe(true);
	expect(inQuietHours("22:00-07:00", at(12))).toBe(false);
	expect(inQuietHours("13:00-14:00", at(13, 30))).toBe(true);
	expect(inQuietHours("", at(1))).toBe(false);
});
