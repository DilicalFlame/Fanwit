/**
 * Test kit (Section 20.8): the whole kernel in Node with a MemoryHost.
 *   const k = await createTestKernel({ modules: [notes], vault: { "a.md": "[[b]]" } });
 *   await k.commands.run("notes.rename", { path: "b.md", to: "c.md" });
 */
import { createMemoryHost } from "./host/memory";
import { Kernel } from "./kernel/kernel.svelte";
import type { ModuleDefinition } from "./kernel/module";

export interface TestKernelOptions {
	modules?: ModuleDefinition[];
	/** Files placed under /vault; available as `k.host.fs` paths. */
	vault?: Record<string, string>;
	files?: Record<string, string>;
	setup?: (k: Kernel) => void | Promise<void>;
}

export async function createTestKernel(o: TestKernelOptions = {}) {
	const files: Record<string, string> = { ...(o.files ?? {}) };
	for (const [p, v] of Object.entries(o.vault ?? {})) files[`/vault/${p}`] = v;
	const host = createMemoryHost({ files });
	const k = new Kernel({ host });
	await o.setup?.(k);
	for (const m of o.modules ?? []) k.modules.register(m);
	k.lifecycle.set("ready");
	return k;
}
