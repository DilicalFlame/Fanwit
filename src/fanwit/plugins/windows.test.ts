import { expect, test } from "vitest";
import { createMemoryHost } from "../host/memory";
import { Kernel } from "../kernel/kernel.svelte";
import { pluginsModule } from "../core/plugins";
import type { PluginService } from "./plugins.svelte";

/**
 * On desktop every window runs its own kernel, and the plugin browser is its own window. A plugin
 * turned on there must come alive in the main window too (they share only the host: files and events).
 */
async function windowKernel(host: ReturnType<typeof createMemoryHost>, label: string) {
	const k = new Kernel({ host: { ...host, windows: { ...host.windows, label, focus: async () => {} } } });
	const sys = k.sys as unknown as Record<string, unknown>;
	const opened: string[] = [];
	sys.vault = { current: null, fs: {}, onDidOpen: { on: () => ({ dispose() {} }) } };
	sys.info = { safeMode: false };
	sys.settings = { get: () => undefined, set: async () => {} };
	sys.config = { plugins: { allow: ["data", "worker"] } };
	sys.status = { items: [], add: () => ({ dispose() {} }) };
	sys.notify = { send: () => ({ id: "n" }), toast: () => {} };
	sys.layout = { views: new Map([["demo.panel", {}]]), openView: async (v: string) => void opened.push(v), applyPreset: async () => {} };
	k.lifecycle.set("ready");
	k.modules.register(pluginsModule);
	await k.modules.activate("fanwit.plugins");
	const svc = k.sys.plugins as PluginService;
	await svc.scan();
	return { k, svc, opened };
}

const until = async (ok: () => boolean) => {
	for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
	return ok();
};

test("a plugin turned on in the plugins window comes alive in the main window", async () => {
	const host = createMemoryHost({
		files: { "/global/plugins/demo/plugin.toml": 'id = "demo"\nname = "Demo"\nversion = "1.0.0"\nentry = "main.js"\n[[contributes.commands]]\nid = "demo.run"\ntitle = "Run demo"\n', "/global/plugins/demo/main.js": "export default () => {};" }
	});
	const main = await windowKernel(host, "main");
	const aux = await windowKernel(host, "aux-plugins");
	expect(main.k.commands.get("demo.run")).toBeFalsy();

	await aux.svc.setEnabled("demo", "global", true);
	expect(aux.k.commands.get("demo.run")).toBeTruthy();
	expect(await until(() => !!main.k.commands.get("demo.run"))).toBe(true);

	// "Open" in the plugins window opens the view in the main window, not in itself
	aux.svc.reveal({ view: "demo.panel" });
	expect(await until(() => main.opened.length > 0)).toBe(true);
	expect(main.opened).toEqual(["demo.panel"]);
	expect(aux.opened).toEqual([]);

	await aux.svc.setEnabled("demo", "global", false);
	expect(await until(() => !main.k.commands.get("demo.run"))).toBe(true);
});
