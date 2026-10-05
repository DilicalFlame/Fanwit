import { expect, test } from "vitest";
import { createMemoryHost } from "../host/memory";
import { Kernel } from "../kernel/kernel.svelte";
import { pluginsModule } from "../core/plugins";
import { StorageService } from "../data/storage.svelte";
import type { PluginService } from "./plugins.svelte";

async function start(host: ReturnType<typeof createMemoryHost>) {
	const k = new Kernel({ host });
	const sys = k.sys as unknown as Record<string, unknown>;
	sys.storage = new StorageService(host, () => "main");
	sys.vault = { current: null, fs: {}, onDidOpen: { on: () => ({ dispose() {} }) } };
	sys.info = { safeMode: false };
	sys.settings = { get: () => undefined, set: async () => {} };
	sys.config = { plugins: { allow: ["data", "worker"] } };
	sys.status = { items: [], add: () => ({ dispose() {} }) };
	sys.notify = { send: () => ({ id: "n" }), toast: () => {} };
	sys.layout = { views: new Map(), openView: async () => {}, applyPreset: async () => {} };
	k.lifecycle.set("ready");
	k.modules.register(pluginsModule);
	await k.modules.activate("fanwit.plugins");
	return { k, svc: k.sys.plugins as PluginService, storage: sys.storage as StorageService };
}

test("Start in safe mode lasts exactly one session", async () => {
	const host = createMemoryHost();
	const first = await start(host);
	expect(first.svc.safeMode).toBe(false);
	// what the crash report's button stores before relaunching
	await first.storage.set("fanwit", "safeModeOnce", true);
	await first.storage.flush();
	expect((await start(host)).svc.safeMode).toBe(true);
	expect((await start(host)).svc.safeMode).toBe(false);
});
