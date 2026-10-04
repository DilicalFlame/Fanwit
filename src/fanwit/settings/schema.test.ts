import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { coreModules } from "../core";
import { appModules } from "../../app/modules";
import type { SettingDef } from "./define";
import { settingsJsonSchema } from "./schema";

const FILE = "schemas/settings.schema.json";
type Node = { properties?: Record<string, Node> };

/** Leaf schemas by dotted key. */
function leaves(n: Node, prefix = "", out = new Map<string, string>()) {
	for (const [k, v] of Object.entries(n.properties ?? {})) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (v.properties) leaves(v, key, out);
		else out.set(key, JSON.stringify(v));
	}
	return out;
}

/**
 * Every setting the app defines is in schemas/settings.schema.json, as defined (`pnpm fw schema`
 * rewrites it). Extra keys are fine: a stripped part leaves its settings behind until then.
 */
test("settings schema is generated from the definitions and up to date", () => {
	const all = { labs: true, devtools: true, manual: true, plugins: true, tray: true, onboarding: true, samples: true };
	const defs = [...coreModules(all), ...appModules].flatMap((m) => [m.contributes?.settings ?? []].flat()).flatMap((c) => (c as { settings: SettingDef[] }).settings);
	const schema = settingsJsonSchema(defs);
	if (process.env.FW_WRITE_SCHEMAS) writeFileSync(FILE, JSON.stringify(schema, null, 2) + "\n");
	expect(defs.length).toBeGreaterThan(10);
	const committed = leaves(JSON.parse(readFileSync(FILE, "utf8")));
	for (const [key, def] of leaves(schema)) expect(committed.get(key), `${key} is stale in ${FILE}: run pnpm fw schema`).toBe(def);
});
