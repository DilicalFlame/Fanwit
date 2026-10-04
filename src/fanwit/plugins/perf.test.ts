import { afterEach, beforeEach, expect, test } from "vitest";
import { createTestKernel } from "../testing";
import type { Kernel } from "../kernel/kernel.svelte";
import { LIMITS } from "./host";
import { PluginService } from "./plugins.svelte";

/**
 * The plugin performance contract: installing more plugins costs nothing until one is used.
 * A scan only reads manifests and registers lazy stubs; no worker starts; a command, view or
 * subscribed event starts exactly the plugin that owns it.
 */

// A stand in Worker: answers the protocol like the real prelude would, and counts instances.
let spawned: string[] = [];
let hang = new Set<string>();
class FakeWorker {
	onmessage: ((e: { data: unknown }) => void) | null = null;
	onerror: unknown = null;
	constructor(_url: string, o: { name: string }) {
		this.name = o.name.replace("plugin:", "");
		spawned.push(this.name);
	}
	name: string;
	private reply(data: unknown) {
		queueMicrotask(() => this.onmessage?.({ data }));
	}
	postMessage(m: { t: string; id?: number; name?: string; payload?: unknown }) {
		if (m.t === "activate") {
			this.reply({ t: "call", id: 1, method: "commands.handle", args: [`${this.name}.run`] });
			this.reply({ t: "call", id: 2, method: "events.on", args: [`test:${this.name}`] });
			this.reply({ t: "activated" });
		} else if (m.t === "invoke" && !hang.has(this.name)) this.reply({ t: "invoked", id: m.id, value: `${this.name} ran` });
		else if (m.t === "event") received.push(`${this.name}:${JSON.stringify(m.payload)}`);
	}
	terminate() {}
}
let received: string[] = [];

const N = 50;
function files() {
	const f: Record<string, string> = {};
	for (let i = 0; i < N; i++) {
		f[`/global/plugins/p${i}/plugin.toml`] = `id = "p${i}"\nname = "P${i}"\nversion = "1.0.0"\nentry = "main.js"\nactivation = ["onEvent:test:p${i}"]\n[[contributes.commands]]\nid = "p${i}.run"\ntitle = "Run p${i}"\n`;
		f[`/global/plugins/p${i}/main.js`] = "export default () => {};";
	}
	f["/config/plugins.toml"] = `enabled = [${Array.from({ length: N }, (_, i) => `"p${i}"`).join(", ")}]\n`;
	return f;
}

async function setup() {
	const k = await createTestKernel({
		files: files(),
		setup: (k: Kernel) => {
			const sys = k.sys as unknown as Record<string, unknown>;
			sys.vault = { current: null, fs: {} };
			sys.settings = { get: () => undefined, set: async () => {} };
			sys.config = { plugins: { allow: ["data", "worker"] } };
			sys.status = { items: [], add: () => ({ dispose() {} }) };
		}
	});
	const svc = new PluginService(k);
	return { k, svc };
}

const saved = { Worker: globalThis.Worker, invokeMs: LIMITS.invokeMs };
beforeEach(() => {
	spawned = [];
	received = [];
	hang = new Set();
	(globalThis as { Worker: unknown }).Worker = FakeWorker;
});
afterEach(() => {
	(globalThis as { Worker: unknown }).Worker = saved.Worker;
	LIMITS.invokeMs = saved.invokeMs;
});

test(`${N} plugins: scanning starts nothing, a command starts exactly one`, async () => {
	const { k, svc } = await setup();
	const t0 = performance.now();
	await svc.scan();
	const ms = performance.now() - t0;
	expect(svc.installed.filter((p) => p.scope === "global" && p.enabled)).toHaveLength(N);
	expect(spawned).toEqual([]);
	// generous for slow CI; locally this is a few ms (manifest parsing only)
	expect(ms).toBeLessThan(500);
	expect(await k.commands.run("p7.run")).toBe("p7 ran");
	expect(spawned).toEqual(["p7"]);
});

test("onEvent activation starts the plugin and hands it the first event", async () => {
	const { k, svc } = await setup();
	await svc.scan();
	k.events.emit("test:p3" as never, { n: 1 } as never);
	await new Promise((r) => setTimeout(r, 20));
	expect(spawned).toEqual(["p3"]);
	expect(received).toEqual(['p3:{"n":1}']);
});

test("a plugin that stops answering times out and is switched off", async () => {
	LIMITS.invokeMs = 20;
	const { k, svc } = await setup();
	await svc.scan();
	hang.add("p1");
	for (let i = 0; i < LIMITS.strikes; i++) await expect(k.commands.run("p1.run")).rejects.toThrow(/did not answer/);
	expect(svc.installed.find((p) => p.manifest.id === "p1")?.error).toBe("Not responding");
	expect(k.commands.get("p1.run")).toBeFalsy();
});
