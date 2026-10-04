import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { coreModules } from "../core";
import { builtinProviders } from "../core/palette";
import { CATEGORY_ORDER } from "../core/settings";
import type { SettingDef } from "../settings/define";
import { catalogs } from "./catalogs";

const read = (f: string) => readFileSync(f, "utf8");
const files = (dir: string, ext: RegExp): string[] => readdirSync(dir, { recursive: true }).map(String).filter((f) => ext.test(f)).map((f) => `${dir}/${f.replace(/\\/g, "/")}`);

/** Every message key the core frame asks for, with its English text. */
function wanted(): Map<string, string> {
	const want = new Map<string, string>();
	const all = { labs: true, devtools: true, manual: true, plugins: true, tray: true, onboarding: true, samples: true };
	const mods = coreModules(all);
	for (const m of mods) {
		const c = m.contributes ?? {};
		for (const cmd of (c.commands ?? []) as { id: string; title: string; category?: string }[]) {
			want.set(`command.${cmd.id}`, cmd.title);
			if (cmd.category) want.set(`category.${cmd.category}`, cmd.category);
		}
		for (const group of [c.settings ?? []].flat() as { settings: SettingDef[] }[])
			for (const d of group.settings) {
				want.set(`setting.${d.key}`, d.title ?? d.key);
				if (d.description) want.set(`setting.${d.key}.description`, d.description);
				if (d.key !== "general.language") for (const [o, label] of Object.entries(d.labels ?? {})) want.set(`setting.${d.key}.${o}`, label);
				want.set(`settingsCategory.${d.category ?? "Other"}`, d.category ?? "Other");
			}
		for (const v of (c.views ?? []) as { id: string; title?: unknown }[]) if (typeof v.title === "string") want.set(`view.${v.id}`, v.title);
		// "view" windows are titled with the app's name
		for (const w of (c.windows ?? []) as { kind: string; title?: unknown }[]) if (typeof w.title === "string" && w.kind !== "view") want.set(`window.${w.kind}`, w.title);
		for (const items of Object.values((c.menus ?? {}) as Record<string, { id: string; label?: string }[]>)) for (const i of items) if (i.label) want.set(`menu.${i.id}`, i.label);
	}
	for (const c of CATEGORY_ORDER) want.set(`settingsCategory.${c}`, c);
	// titles written in the core presets (templated ones are names, not words)
	for (const f of [...files("src/fanwit/layout/presets", /\.toml$/), ...files("src/fanwit/manual/presets", /\.toml$/)])
		for (const m of read(f).matchAll(/^title = "([^"$]+)"$/gm)) want.set(`title.${m[1]}`, m[1]);
	// t("key", "English") in the frame's components and services
	const src = [...files("src/fanwit/workbench", /\.(svelte|ts)$/), ...files("src/fanwit/views", /\.(svelte|ts)$/)].map(read).join("\n");
	for (const m of src.matchAll(/\bt\("([\w.]+)", "((?:[^"\\]|\\.)*)"/g)) want.set(m[1], JSON.parse(`"${m[2]}"`));
	// keys built from data in those components
	for (const p of builtinProviders) {
		want.set(`ui.palette.mode.${p.title}`, p.title);
		if (p.placeholder) want.set(`ui.palette.placeholder.${p.title}`, p.placeholder);
	}
	const palette = read("src/fanwit/workbench/Palette.svelte");
	for (const m of palette.slice(palette.indexOf("const MODES")).matchAll(/\["[^"]", "([^"]+)"\]/g)) want.set(`ui.palette.prefix.${m[1]}`, m[1]);
	for (const m of read("src/fanwit/workbench/MenuBar.svelte").matchAll(/\["menubar\/\w+", "(\w+)"\]/g)) want.set(`ui.menubar.${m[1].toLowerCase()}`, m[1]);
	const welcome = read("src/fanwit/views/Welcome.svelte");
	for (const m of welcome.matchAll(/\["([\w.]+)", "([^"]+)", "[\w-]+"\]/g)) want.set(`ui.welcome.action.${m[1]}`, m[2]);
	for (const m of welcome.matchAll(/\["[^"]+", "([^"]+)", "[\w-]+", \{ view: "([\w.]+)" \}\]/g)) want.set(`ui.welcome.lab.${m[2]}`, m[1]);
	for (const m of read("src/fanwit/views/settings/Settings.svelte").matchAll(/\["(global|vault|window)", "(\w+)"\]/g)) want.set(`ui.settings.scope.${m[1]}`, m[2]);
	return want;
}

/**
 * Every language the app offers translates the whole core frame: commands, settings, views,
 * preset titles and the text components pass to t(). No stale keys either.
 * FW_I18N_TODO=<file> writes the missing keys with their English text, to translate from.
 */
test("shipped catalogs are complete", () => {
	const want = wanted();
	const todo: Record<string, Record<string, string>> = {};
	for (const [locale, messages] of Object.entries(catalogs)) {
		const missing = [...want.keys()].filter((k) => !messages[k]);
		todo[locale] = Object.fromEntries(missing.map((k) => [k, want.get(k)!]));
		expect(Object.keys(messages).filter((k) => !want.has(k)), `${locale}: stale`).toEqual([]);
	}
	if (process.env.FW_I18N_TODO) writeFileSync(process.env.FW_I18N_TODO, JSON.stringify(todo, null, 2));
	for (const [locale, missing] of Object.entries(todo)) expect(Object.keys(missing), `${locale}: missing`).toEqual([]);
});
