/**
 * JSON Schema for settings.toml, built from the registered setting definitions (not scraped from
 * source), so editors validate types, ranges and enum values and flag typos in known namespaces.
 * `pnpm fw schema` writes it to schemas/settings.schema.json; a test fails when it is stale.
 */
import type { SettingDef } from "./define";

type Schema = Record<string, unknown> & { properties?: Record<string, Schema> };

const TYPES: Record<string, Schema> = {
	string: { type: "string" },
	path: { type: "string" },
	keybinding: { type: "string" },
	color: { type: "string" },
	number: { type: "number" },
	boolean: { type: "boolean" },
	json: {},
	"string[]": { type: "array", items: { type: "string" } }
};

function leaf(d: SettingDef): Schema {
	const s: Schema = d.type === "enum" ? { enum: d.options ?? [] } : { ...TYPES[d.type] };
	if (d.min !== undefined) s.minimum = d.min;
	if (d.max !== undefined) s.maximum = d.max;
	const text = [d.title, d.description].filter(Boolean).join(". ");
	if (text) s.description = text;
	if (d.default !== undefined) s.default = d.default;
	if (d.deprecated) s.deprecated = true;
	return s;
}

export function settingsJsonSchema(defs: SettingDef[]): Schema {
	const root: Schema = { $schema: "http://json-schema.org/draft-07/schema#", title: "settings.toml", type: "object", properties: {} };
	// secrets live in the OS keychain, never in TOML
	for (const d of [...defs].filter((x) => !x.secret).sort((a, b) => a.key.localeCompare(b.key))) {
		const parts = d.key.split(".");
		let node = root;
		for (const p of parts.slice(0, -1)) {
			node.properties ??= {};
			// a namespace the app defines rejects unknown keys (typos); unknown namespaces (plugins) stay open
			node = node.properties[p] ??= { type: "object", additionalProperties: false, properties: {} };
		}
		node.properties![parts.at(-1)!] = leaf(d);
	}
	return root;
}
