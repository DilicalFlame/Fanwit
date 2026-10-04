/**
 * Module playground: the reader's code is a real module, registered in the running app and
 * activated at once, so its commands, views and keys work like any other. Stopping unregisters
 * it, which disposes everything it contributed (the spec's "scratch module, disposed afterwards").
 */
import type { Kernel } from "../../kernel/kernel.svelte";
import { defineModule, type ModuleDefinition } from "../../kernel/module";
import type { Disposable } from "../../kernel/disposable";

export interface ModuleRun {
	id: string;
	commands: { id: string; title: string }[];
	stop(): Promise<void>;
}

let seq = 0;

/**
 * Run `code`: JavaScript whose `export default` is a module definition. `print` receives what the
 * code logs with `console.log`. The module's id is made unique, so runs never collide.
 */
export async function runModule(k: Kernel, code: string, print: (kind: "log" | "error", text: string) => void): Promise<ModuleRun> {
	const body = code.replace(/^\s*import\s[^;]*;?\s*$/gm, "").replace(/export\s+default\s+/, "return ");
	const console = {
		log: (...a: unknown[]) => print("log", a.map(show).join(" ")),
		error: (...a: unknown[]) => print("error", a.map(show).join(" "))
	};
	// eslint-disable-next-line @typescript-eslint/no-implied-eval
	const def = new Function("defineModule", "console", body)(defineModule, console) as ModuleDefinition | undefined;
	if (!def || typeof def !== "object" || !def.id) throw new Error("The code must `export default defineModule({ id, ... })`.");
	const id = `playground.${def.id.replace(/^playground\./, "")}.${++seq}`;
	const commands = ((def.contributes?.commands as { id: string; title: string }[] | undefined) ?? []).map((c) => ({ id: c.id, title: c.title }));
	const taken = commands.filter((c) => k.commands.get(c.id));
	if (taken.length) throw new Error(`${taken.map((c) => `"${c.id}"`).join(", ")} already exists in the app. Command ids are unique: pick another.`);
	const registration: Disposable = k.modules.register({ ...def, id, activationEvents: [...(def.activationEvents ?? []), `onPlayground:${id}`] });
	try {
		await k.modules.activate(id, "playground");
	} catch (e) {
		registration.dispose();
		throw e;
	}
	print("log", `Module ${id} is running${commands.length ? ` with ${commands.length} command${commands.length > 1 ? "s" : ""}` : ""}.`);
	return {
		id,
		commands,
		stop: async () => {
			await k.modules.unregister(id);
			print("log", `Module ${id} stopped; everything it added is gone.`);
		}
	};
}

const show = (v: unknown) => (typeof v === "string" ? v : (() => {
	try {
		return JSON.stringify(v);
	} catch {
		return String(v);
	}
})());
