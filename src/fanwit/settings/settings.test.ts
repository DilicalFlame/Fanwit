import { expect, test } from "vitest";
import { createMemoryHost } from "../host/memory";
import { logs } from "../kernel/logger";
import { defineSettings, s } from "./define";
import { SettingsService } from "./settings.svelte";

test("layers resolve vault over global over app over defaults, invalid values fall back", async () => {
	const host = createMemoryHost({ files: { "/config/settings.toml": "# mine\n[notes.editor]\nfontSize = 14\nwrap = \"nope\"\n" } });
	const svc = new SettingsService(host, logs.scoped("t"));
	svc.contribute(
		defineSettings("notes", {
			"editor.fontSize": s.number(15, { min: 10, max: 32 }),
			"editor.wrap": s.enum("soft", ["off", "soft", "bounded"])
		}),
		"notes"
	);
	await svc.init({ app: { "notes.editor.fontSize": 13 }, overrides: {}, env: {} });
	expect(svc.get("notes.editor.fontSize")).toBe(14);
	expect(svc.get("notes.editor.wrap")).toBe("soft"); // invalid in file -> default
	expect(svc.global.diagnostics.some((d) => d.message.includes("wrap"))).toBe(true);

	await host.fs.writeText("/vault/.fanwit/settings.toml", "");
	await svc.setVault("/vault/.fanwit");
	await svc.set("notes.editor.fontSize", 16, { scope: "vault" });
	expect(svc.inspect("notes.editor.fontSize")).toMatchObject({ default: 15, app: 13, global: 14, vault: 16, effective: 16, source: "vault" });
	await svc.reset("notes.editor.fontSize", { scope: "vault" });
	expect(svc.get("notes.editor.fontSize")).toBe(14);
	await expect(svc.set("notes.editor.fontSize", 99)).rejects.toMatchObject({ code: "SETTING_INVALID" });
});

test("cli overrides and environment variables win", async () => {
	const host = createMemoryHost();
	const svc = new SettingsService(host, logs.scoped("t"));
	svc.contribute(defineSettings("notes", { "editor.fontSize": s.number(15) }), "notes");
	await svc.init({ overrides: {}, env: { NOTES_EDITOR_FONTSIZE: "18" } });
	expect(svc.get("notes.editor.fontSize")).toBe(18);
	expect(svc.inspect("notes.editor.fontSize").source).toBe("cli");
});
