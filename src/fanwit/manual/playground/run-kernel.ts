/**
 * Sandbox playground: the reader's module runs in a kernel of its own (in memory, no app around
 * it), so a lesson can show exactly what a module does to a kernel: the commands it adds, the
 * context keys it sets, the events it emits and every command run, without touching the app.
 */
import { createTestKernel } from "../../testing";
import { runModule, type ModuleRun } from "./run-module";
import type { Kernel } from "../../kernel/kernel.svelte";
import type { Disposable } from "../../kernel/disposable";

export interface SandboxRun extends ModuleRun {
	kernel: Kernel;
}

/** A fresh kernel with the reader's module in it. `trace` receives events and command runs as they happen. */
export async function runSandbox(code: string, print: (kind: "log" | "error", text: string) => void, trace: (line: string) => void): Promise<SandboxRun> {
	const kernel = await createTestKernel();
	const subs: Disposable[] = [
		kernel.events.onAny.on((e) => trace(`event  ${e.name}${e.payload === undefined ? "" : ` ${JSON.stringify(e.payload)}`}`)),
		kernel.commands.onDidExecute.on((r) =>
			trace(`run    ${r.id} ${JSON.stringify(r.args)}${r.ok ? (r.result === undefined ? "" : ` -> ${JSON.stringify(r.result)}`) : `  failed: ${(r.error as Error)?.message ?? r.error}`}`)
		)
	];
	const run = await runModule(kernel, code, print);
	return {
		...run,
		kernel,
		stop: async () => {
			await run.stop();
			for (const s of subs) s.dispose();
		}
	};
}
