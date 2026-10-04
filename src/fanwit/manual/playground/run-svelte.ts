/**
 * Svelte playground: compiles components in the browser (svelte/compiler, loaded on first use)
 * and mounts the first with the app's own Svelte runtime, so runes and transitions behave exactly
 * as in the app. Imports may name Svelte's own modules and the playground's other files; anything
 * else is reported, not fetched.
 */
import { mount, unmount } from "svelte";
import * as internal from "svelte/internal/client";
import * as svelte from "svelte";
import * as store from "svelte/store";
import * as transition from "svelte/transition";
import * as easing from "svelte/easing";
import * as motion from "svelte/motion";
import * as animate from "svelte/animate";
import * as reactivity from "svelte/reactivity";

const MODULES: Record<string, unknown> = {
	svelte,
	"svelte/internal/client": internal,
	"svelte/store": store,
	"svelte/transition": transition,
	"svelte/easing": easing,
	"svelte/motion": motion,
	"svelte/animate": animate,
	"svelte/reactivity": reactivity
};
(globalThis as unknown as { __fw_play: typeof MODULES }).__fw_play = MODULES;

export interface SvelteRun {
	stop(): void;
}

/** One file of a playground; the first is the component that is shown. */
export interface PlayFile {
	name: string;
	code: string;
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

const IMPORT = /^import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?$/gm;

/**
 * Compile and mount the first file. Files import each other as `./Name.svelte`, `./name.svelte.js`
 * or `./name.js`; each becomes its own module. `.svelte.js` and `.svelte.ts` files may use runes,
 * like FaNWiT's services.
 */
export async function runSvelte(source: string | PlayFile[], target: HTMLElement): Promise<SvelteRun> {
	const files = typeof source === "string" ? [{ name: "App.svelte", code: source }] : source;
	const { compile, compileModule } = await import("svelte/compiler");
	const urls = new Map<string, string>();

	const build = (name: string, from: string[]): string => {
		const known = urls.get(name);
		if (known) return known;
		if (from.includes(name)) throw new CompileError(`${[...from, name].join(" -> ")}: these files import each other in a circle.`);
		const file = files.find((f) => f.name === name);
		if (!file) throw new CompileError(`${from.at(-1)} imports "./${name}", which is not a file of this playground.`);
		let js: string;
		try {
			if (name.endsWith(".svelte")) js = compile(file.code, { filename: name, generate: "client", css: "injected", runes: true, dev: false }).js.code;
			else if (/\.svelte\.(js|ts)$/.test(name)) js = compileModule(file.code, { filename: name, generate: "client", dev: false }).js.code;
			else js = file.code;
		} catch (e) {
			const err = e as { message: string; start?: { line: number; column: number } };
			throw new CompileError(`${files.length > 1 ? `${name}: ` : ""}${err.message.split("\n")[0]}`, err.start?.line, err.start?.column);
		}
		// Svelte's modules become reads from the app's own (one runtime for everything); the
		// playground's other files become their compiled modules
		js = js.replace(IMPORT, (_, what: string, spec: string) => {
			if (spec.startsWith("./")) return `import ${what} from ${JSON.stringify(build(spec.slice(2), [...from, name]))};`;
			if (!(spec in MODULES)) throw new CompileError(`Only Svelte's own modules and this playground's files can be imported here, not "${spec}".`);
			const ns = what.startsWith("* as ") ? what.slice(5) : null;
			return ns ? `const ${ns} = globalThis.__fw_play[${JSON.stringify(spec)}];` : `const ${what.replace(/\s+as\s+/g, ": ")} = globalThis.__fw_play[${JSON.stringify(spec)}];`;
		});
		js = js.replace(/^import\s+['"][^'"]+['"];?$/gm, "");
		const url = URL.createObjectURL(new Blob([js], { type: "text/javascript" }));
		urls.set(name, url);
		return url;
	};

	try {
		const App = (await import(/* @vite-ignore */ build(files[0].name, []))).default;
		const app = mount(App, { target });
		return { stop: () => void unmount(app) };
	} finally {
		for (const url of urls.values()) URL.revokeObjectURL(url);
	}
}
