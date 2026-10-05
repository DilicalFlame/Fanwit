<script lang="ts">
	import { getContext, untrack, type Snippet } from "svelte";
	import { buildMode } from "virtual:fw-docs";
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import type { Editor } from "../playground/editor";
	import type { ModuleRun } from "../playground/run-module";
	import type { SandboxRun } from "../playground/run-kernel";
	import type { SvelteRun } from "../playground/run-svelte";
	import { LAB, type LabReporter } from "./Lab.svelte";

	/**
	 * A playground. The code blocks inside become an editor; with several, each is a file (name it
	 * with ```svelte file="Child.svelte"; the first is the one that runs).
	 *
	 * - `mode="svelte"`: Svelte components, compiled in the browser and rendered beside the code.
	 *   Files import each other as `./Child.svelte` or `./store.svelte.js`.
	 * - `mode="js"` / `mode="ts"`: a script; what it logs with console.log shows beside it.
	 * - `mode="module"`: JavaScript that `export default`s a module. Run registers it in the live
	 *   app (its commands appear in the palette); Stop disposes everything it added.
	 * - `mode="kernel"`: the same module code in a sandbox kernel of its own, with an inspector:
	 *   its commands, context keys, and a trace of every event and command run.
	 * - `mode="rust"`: Rust compiled and run on the official Rust Playground (needs the internet).
	 *
	 * `id` names the saved edits (they survive a title change). Code that runs in the page needs
	 * development, the docs site or developer mode; production builds show it read only.
	 */
	type Mode = "module" | "kernel" | "svelte" | "rust" | "js" | "ts";
	let { mode: requested = "module", title, id, height = 260, children }: { mode?: Mode; title?: string; id?: string; height?: number; children?: Snippet } = $props();
	// the docs site never lets a reader's module into its own kernel: it runs in a sandbox instead
	const mode = $derived<Mode>(requested === "module" && buildMode === "docs" ? "kernel" : requested);
	const k = getKernel();
	let source = $state<HTMLElement>();
	let host = $state<HTMLElement>();
	let preview = $state<HTMLElement>();
	let editor: Editor | null = null;
	let files = $state<{ name: string; original: string; text: string }[]>([]);
	let current = $state(0);
	let lines = $state<{ kind: "log" | "error" | "trace"; text: string }[]>([]);
	let running = $state<ModuleRun | SandboxRun | null>(null);
	let svelteRun: SvelteRun | null = null;
	let busy = $state(false);
	let loaded = $state(false);
	let rustLink = $state("");
	let abort: AbortController | null = null;
	// a sandbox or a remote compiler cannot touch the app
	const allowed = $derived(mode === "rust" || mode === "kernel" || buildMode !== "prod" || !!k.context.lookup(null)("devMode"));
	const ICONS: Record<Mode, string> = { module: "blocks", kernel: "box", svelte: "component", rust: "cog", js: "square-code", ts: "square-code" };
	const TITLES: Record<Mode, string> = { module: "Module playground", kernel: "Kernel sandbox", svelte: "Svelte playground", rust: "Rust playground", js: "JavaScript", ts: "TypeScript" };
	const HINTS: Record<Mode, string> = {
		module: "Press Run (Ctrl+Enter): the module joins the running app.",
		kernel: "Press Run (Ctrl+Enter): the module starts in a kernel of its own, and everything it does shows here.",
		svelte: "",
		rust: "Press Run (Ctrl+Enter): the code compiles and runs on the Rust Playground.",
		js: "Press Run (Ctrl+Enter): what the code logs shows here.",
		ts: "Press Run (Ctrl+Enter): the types are checked away and what the code logs shows here."
	};
	const LANG: Record<Mode, "js" | "svelte" | "rust" | "ts"> = { module: "js", kernel: "js", svelte: "svelte", rust: "rust", js: "js", ts: "ts" };
	// saved edits are per page, playground and file; the props name it once
	const key = untrack(() => `fw-play:${id ?? `${location.search}:${title ?? ""}`}:${mode}`);
	const fileKey = (i: number, name: string) => (i === 0 ? key : `${key}:${name}`);
	const sandbox = $derived(running && "kernel" in running ? running.kernel : null);
	const contextKeys = $derived.by(() => {
		if (!sandbox) return [];
		void sandbox.context.version;
		// a detached element: only the sandbox's own keys, not the page's DOM scopes
		const snap = sandbox.context.snapshot(document.createElement("div"));
		return Object.entries(snap).filter(([key, v]) => v !== undefined && !key.startsWith("host."));
	});

	const print = (kind: "log" | "error" | "trace", text: string) => (lines = [...lines.slice(-80), { kind, text }]);

	// inside a <Lab>: report what the output shows, so the lab can check itself
	const lab = getContext<LabReporter | undefined>(LAB);
	$effect(() => {
		if (lab && lines.length) lab.report(lines.map((l) => l.text).join("\n"));
	});
	$effect(() => {
		const el = preview;
		if (!lab || !el) return;
		const mo = new MutationObserver(() => lab.report(el.innerText));
		mo.observe(el, { subtree: true, childList: true, characterData: true });
		return () => mo.disconnect();
	});

	const load = (k: string) => {
		try {
			return localStorage.getItem(k);
		} catch {
			return null;
		}
	};
	const save = (k: string, text: string | null) => {
		try {
			if (text === null) localStorage.removeItem(k);
			else localStorage.setItem(k, text);
		} catch {
			/* storage unavailable */
		}
	};

	$effect(() => {
		if (!source || !host) return;
		const blocks = [...source.querySelectorAll<HTMLElement>(".fw-code")];
		const list = (blocks.length ? blocks : [...source.querySelectorAll<HTMLElement>("pre")]).map((b, i) => {
			const name = b.dataset.file ?? (i === 0 ? (mode === "svelte" ? "App.svelte" : "main") : `File${i + 1}`);
			const original = (b.querySelector("pre") ?? b).textContent?.replace(/\n$/, "") ?? "";
			return { name, original, text: load(fileKey(i, name)) ?? original };
		});
		untrack(() => {
			files = list;
			current = 0;
		});
		let alive = true;
		void import("../playground/editor").then(({ createEditor }) => {
			if (!alive || !host) return;
			editor = createEditor(host, {
				doc: list[0]?.text ?? "",
				lang: LANG[mode],
				run: () => void run(),
				label: `${title ?? "Playground"} code`,
				change: (t) => {
					const f = files[current];
					if (!f) return;
					f.text = t;
					save(fileKey(current, f.name), t);
				}
			});
			loaded = true;
			if (mode === "rust") void import("../playground/run-rust").then((r) => (rustLink = r.playgroundUrl(list[0]?.text ?? "")));
			if (mode === "svelte" && allowed) void run();
		});
		return () => {
			alive = false;
			editor?.destroy();
			void stop(true);
		};
	});

	function show(i: number) {
		if (i === current || !editor) return;
		current = i;
		editor.set(files[i].text);
	}

	async function run() {
		if (!editor || !allowed) return;
		busy = true;
		await stop(true);
		lines = [];
		const code = files[0]?.text ?? editor.text();
		try {
			if (mode === "svelte") {
				const { runSvelte } = await import("../playground/run-svelte");
				preview!.replaceChildren();
				svelteRun = await runSvelte(
					files.map((f) => ({ name: f.name, code: f.text })),
					preview!
				);
			} else if (mode === "js" || mode === "ts") {
				const { runScript } = await import("../playground/run-script");
				svelteRun = await runScript(code, mode === "ts", print);
				if (!lines.length) print("trace", "The code ran and logged nothing.");
			} else if (mode === "rust") {
				const { runRust, playgroundUrl } = await import("../playground/run-rust");
				rustLink = playgroundUrl(code);
				print("trace", "Compiling…");
				abort = new AbortController();
				const r = await runRust(code, abort.signal);
				lines = [];
				// the program's output first; warnings after it, dimmed (errors when it did not build)
				if (r.stdout) print("log", r.stdout.replace(/\n$/, ""));
				if (r.stderr) print(r.ok ? "trace" : "error", r.stderr);
				if (r.ok && !r.stdout) print("trace", "The program ran and printed nothing.");
			} else if (mode === "kernel") {
				const { runSandbox } = await import("../playground/run-kernel");
				running = await runSandbox(code, print, (t) => print("trace", t));
			} else {
				const { runModule } = await import("../playground/run-module");
				running = await runModule(k, code, print);
			}
		} catch (e) {
			const err = e as Error & { line?: number; column?: number };
			if (err.name !== "AbortError") print("error", `${err.line ? `Line ${err.line}:${err.column ?? 0}: ` : ""}${err.message}`);
		} finally {
			busy = false;
		}
	}
	async function stop(quiet = false) {
		abort?.abort();
		abort = null;
		svelteRun?.stop();
		svelteRun = null;
		const r = running;
		running = null;
		if (r) await r.stop().catch((e: Error) => !quiet && print("error", e.message));
	}
	function reset() {
		files.forEach((f, i) => {
			f.text = f.original;
			save(fileKey(i, f.name), null);
		});
		editor?.set(files[current]?.original ?? "");
	}
	function runCommand(id: string) {
		const target = sandbox ?? k;
		void target.commands.run(id, {}, { source: "api", interactive: !sandbox }).catch((e) => print("error", (e as Error).message));
	}
</script>

<div class="fw-play fw-widget" data-mode={mode}>
	<div class="fw-play-bar">
		<Icon name={ICONS[mode]} size={14} />
		<span class="fw-play-title">{title ?? TITLES[mode]}</span>
		{#if allowed}
			<button type="button" class="fw-play-btn primary" disabled={!loaded || busy} onclick={run} title="Run (Ctrl+Enter)"><Icon name={busy ? "loader" : "play"} size={13} class={busy ? "animate-spin" : ""} />{running ? "Run again" : "Run"}</button>
			{#if running}<button type="button" class="fw-play-btn" onclick={() => stop()}><Icon name="square" size={12} />Stop</button>{/if}
		{:else}
			<span class="fw-play-note">Read only: turn on developer mode to run it.</span>
		{/if}
		{#if mode === "rust" && rustLink}<a class="fw-play-btn" href={rustLink} target="_blank" rel="noopener noreferrer" title="Open this code in the Rust Playground"><Icon name="external-link" size={12} />Rust Playground</a>{/if}
		<button type="button" class="fw-play-btn" onclick={reset} title="Back to the original code"><Icon name="rotate-ccw" size={12} />Reset</button>
	</div>
	{#if files.length > 1}
		<div class="fw-play-files" role="tablist" aria-label="Files">
			{#each files as f, i (f.name)}
				<button type="button" role="tab" aria-selected={i === current} class:active={i === current} onclick={() => show(i)}>{f.name}</button>
			{/each}
		</div>
	{/if}
	<div class="fw-play-main" style:height="{height}px">
		<div class="fw-play-editor" bind:this={host}></div>
		<div class="fw-play-out" aria-live="polite">
			{#if mode === "svelte"}<div class="fw-play-preview" bind:this={preview}></div>{/if}
			{#if running?.commands.length}
				<div class="fw-play-cmds">
					{#each running.commands as c (c.id)}
						<button type="button" class="fw-play-btn" onclick={() => runCommand(c.id)}><Icon name="square-terminal" size={12} />{c.title}</button>
					{/each}
				</div>
			{/if}
			{#if sandbox}
				<div class="fw-play-keys" aria-label="Context keys in the sandbox">
					<span class="fw-play-label">Context keys</span>
					{#each contextKeys as [name, value] (name)}<code>{name} = {JSON.stringify(value)}</code>{:else}<span class="fw-play-line muted">none set</span>{/each}
				</div>
			{/if}
			{#each lines as l, i (i)}<div class="fw-play-line" class:error={l.kind === "error"} class:trace={l.kind === "trace"}>{l.text}</div>{/each}
			{#if HINTS[mode] && !running && !lines.length}<div class="fw-play-line muted">{HINTS[mode]}</div>{/if}
		</div>
	</div>
	<div hidden bind:this={source}>{@render children?.()}</div>
</div>
