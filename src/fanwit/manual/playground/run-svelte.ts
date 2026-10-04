/**
 * Svelte playground: compiles a component in the browser (svelte/compiler, loaded on first use)
 * and mounts it with the app's own Svelte runtime, so runes and transitions behave exactly as in
 * the app. Imports may name Svelte's own modules; anything else is reported, not fetched.
 */
import { mount, unmount } from "svelte";
import * as internal from "svelte/internal/client";
import * as svelte from "svelte";
import * as store from "svelte/store";
import * as transition from "svelte/transition";
import * as easing from "svelte/easing";
import * as motion from "svelte/motion";
import * as animate from "svelte/animate";

const MODULES: Record<string, unknown> = { svelte, "svelte/internal/client": internal, "svelte/store": store, "svelte/transition": transition, "svelte/easing": easing, "svelte/motion": motion, "svelte/animate": animate };
(globalThis as unknown as { __fw_play: typeof MODULES }).__fw_play = MODULES;

export interface SvelteRun {
	stop(): void;
}

/** A compile error with its position, for the output pane. */
export class CompileError extends Error {
	constructor(
		message: string,
		readonly line?: number,
		readonly column?: number
	) {
		super(message);
	}
}

export async function runSvelte(source: string, target: HTMLElement): Promise<SvelteRun> {
	const { compile } = await import("svelte/compiler");
	let js: string;
	try {
		js = compile(source, { filename: "App.svelte", generate: "client", css: "injected", runes: true, dev: false }).js.code;
	} catch (e) {
		const err = e as { message: string; start?: { line: number; column: number } };
		throw new CompileError(err.message.split("\n")[0], err.start?.line, err.start?.column);
	}
	// imports become reads from the app's own modules (one Svelte runtime for everything)
	js = js.replace(/^import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?$/gm, (_, what: string, from: string) => {
		if (!(from in MODULES)) throw new CompileError(`Only Svelte's own modules can be imported here, not "${from}".`);
		const ns = what.startsWith("* as ") ? what.slice(5) : null;
		return ns ? `const ${ns} = globalThis.__fw_play[${JSON.stringify(from)}];` : `const ${what.replace(/\s+as\s+/g, ": ")} = globalThis.__fw_play[${JSON.stringify(from)}];`;
	});
	js = js.replace(/^import\s+['"][^'"]+['"];?$/gm, "");
	const url = URL.createObjectURL(new Blob([js], { type: "text/javascript" }));
	try {
		const App = (await import(/* @vite-ignore */ url)).default;
		const app = mount(App, { target });
		return { stop: () => void unmount(app) };
	} finally {
		URL.revokeObjectURL(url);
	}
}
