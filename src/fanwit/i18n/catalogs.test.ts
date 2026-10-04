import { expect, test } from "vitest";
import { coreModules } from "../core";
import { catalogs } from "./catalogs";

/** Every language the app offers covers every core command title and category, with no stale keys. */
test("shipped catalogs are complete", () => {
	const all = { labs: true, devtools: true, manual: true, plugins: true, tray: true, onboarding: true, samples: true };
	const commands = coreModules(all).flatMap((m) => (m.contributes?.commands ?? []) as { id: string; category?: string }[]);
	const want = new Set([...commands.map((c) => `command.${c.id}`), ...commands.flatMap((c) => (c.category ? [`category.${c.category}`] : []))]);
	for (const [locale, messages] of Object.entries(catalogs)) {
		expect([...want].filter((k) => !messages[k]), `${locale}: missing`).toEqual([]);
		expect(Object.keys(messages).filter((k) => !want.has(k)), `${locale}: stale`).toEqual([]);
	}
});
