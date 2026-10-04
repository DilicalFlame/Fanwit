import { expect, test } from "vitest";
import { createMemoryHost } from "../host/memory";
import { Kernel } from "../kernel/kernel.svelte";
import { pluginsModule } from "../core/plugins";
import type { PluginService } from "./plugins.svelte";

const toml = (v: string) => `id = "demo"\nname = "Demo"\nversion = "${v}"\n`;

/** Installs are all or nothing: a failed write keeps the previous version and leaves no debris. */
test("plugin installs are transactional", async () => {
	const host = createMemoryHost({ files: {} });
	let failOn = "";
	const write = host.fs.writeText.bind(host.fs);
	host.fs.writeText = async (p, t) => (p.endsWith(failOn) && failOn ? Promise.reject(new Error("disk full")) : write(p, t));
	const k = new Kernel({ host });
	const sys = k.sys as unknown as Record<string, unknown>;
	sys.vault = { current: null, fs: {}, onDidOpen: { on: () => ({ dispose() {} }) } };
	sys.info = { safeMode: false };
	sys.settings = { get: () => undefined, set: async () => {} };
	sys.config = { plugins: { allow: ["data"] } };
	sys.status = { items: [], add: () => ({ dispose() {} }) };
	sys.notify = { send: () => ({ id: "n" }), toast: () => {} };
	k.lifecycle.set("ready");
	k.modules.register(pluginsModule);
	await k.modules.activate("fanwit.plugins");
	const svc = k.sys.plugins as PluginService;
	const dir = svc.dir("global")!;
	const names = async () => (await host.fs.list(dir)).filter((e) => e.dir).map((e) => e.name);

	await svc.installFromFiles({ "plugin.toml": toml("1.0.0"), "a.css": "a {}" });
	failOn = "b.css";
	await expect(svc.installFromFiles({ "plugin.toml": toml("2.0.0"), "b.css": "b {}" })).rejects.toThrow(/Nothing was installed/);
	expect(await host.fs.readText(`${dir}/demo/plugin.toml`)).toContain("1.0.0");
	expect(await names()).toEqual(["demo"]);

	failOn = "";
	await expect(svc.installFromFiles({ "plugin.toml": toml("2.0.0"), "../evil.css": "x" })).rejects.toThrow(/unsafe file path/);
	await svc.installFromFiles({ "plugin.toml": toml("2.0.0"), "b.css": "b {}" });
	expect(await host.fs.readText(`${dir}/demo/plugin.toml`)).toContain("2.0.0");
	expect(await host.fs.exists(`${dir}/demo/a.css`)).toBe(false);
	expect(await names()).toEqual(["demo"]);
	expect(svc.installed.filter((p) => p.scope === "global").map((p) => p.manifest.version)).toEqual(["2.0.0"]);
});
