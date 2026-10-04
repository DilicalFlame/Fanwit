<script lang="ts">
	import { untrack, type Snippet } from "svelte";
	import { buildMode } from "virtual:fw-docs";
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import type { Editor } from "../playground/editor";
	import type { ModuleRun } from "../playground/run-module";
	import type { SandboxRun } from "../playground/run-kernel";
	import type { SvelteRun } from "../playground/run-svelte";

	/**
	 * A playground. Put one code block inside; it becomes an editor.
	 *
	 * - `mode="module"`: JavaScript that `export default`s a module. Run registers it in the live
	 *   app (its commands appear in the palette); Stop disposes everything it added.
	 * - `mode="kernel"`: the same module code in a sandbox kernel of its own, with an inspector:
	 *   its commands, context keys, and a trace of every event and command run.
	 * - `mode="svelte"`: a Svelte component, compiled in the browser and rendered beside the code.
	 * - `mode="rust"`: Rust compiled and run on the official Rust Playground (needs the internet).
	 *
	 * `id` names the saved edits (they survive a title change). Module code runs in development
	 * and on the docs site; production builds show it read only unless developer mode is on.
	 */
	type Mode = "module" | "kernel" | "svelte" | "rust";
	let { mode = "module", title, id, height = 260, children }: { mode?: Mode; title?: string; id?: string; height?: number; children?: Snippet } = $props();
	const k = getKernel();
	let source = $state<HTMLElement>();
	let host = $state<HTMLElement>();
	let preview = $state<HTMLElement>();
	let editor: Editor | null = null;
	let original = "";
	let lines = $state<{ kind: "log" | "error" | "trace"; text: string }[]>([]);
	let running = $state<ModuleRun | SandboxRun | null>(null);
	let svelteRun: SvelteRun | null = null;
	let busy = $state(false);
	let loaded = $state(false);
	let rustLink = $state("");
	let abort: AbortController | null = null;
	// a sandbox or a remote compiler cannot touch the app; module code joins it
	const allowed = $derived(mode === "rust" || mode === "kernel" || buildMode !== "prod" || !!k.context.lookup(null)("devMode"));
	const ICONS: Record<Mode, string> = { module: "blocks", kernel: "box", svelte: "component", rust: "cog" };
	const TITLES: Record<Mode, string> = { module: "Module playground", kernel: "Kernel sandbox", svelte: "Svelte playground", rust: "Rust playground" };
	const HINTS: Record<Mode, string> = {
		module: "Press Run (Ctrl+Enter): the module joins the running app.",
		kernel: "Press Run (Ctrl+Enter): the module starts in a kernel of its own, and everything it does shows here.",
		svelte: "",
		rust: "Press Run (Ctrl+Enter): the code compiles and runs on the Rust Playground."
	};
	// saved edits are per page and playground; the props name it once
	const key = untrack(() => `fw-play:${id ?? `${location.search}:${title ?? ""}`}:${mode}`);
	const sandbox = $derived(running && "kernel" in running ? running.kernel : null);
	const contextKeys = $derived.by(() => {
		if (!sandbox) return [];
		void sandbox.context.version;
		// a detached element: only the sandbox's own keys, not the page's DOM scopes
		const snap = sandbox.context.snapshot(document.createElement("div"));
		return Object.entries(snap).filter(([key, v]) => v !== undefined && !key.startsWith("host."));
	});

	const print = (kind: "log" | "error" | "trace", text: string) => (lines = [...lines.slice(-80), { kind, text }]);

	$effect(() => {
		if (!source || !host) return;
		original = source.querySelector("pre")?.textContent?.replace(/\n$/, "") ?? "";
		let saved: string | null = null;
		try {
			saved = localStorage.getItem(key);
		} catch {
			/* storage unavailable */
		}
		let alive = true;
		void import("../playground/editor").then(({ createEditor }) => {
			if (!alive || !host) return;
			editor = createEditor(host, {
				doc: saved ?? original,
				lang: mode === "svelte" ? "svelte" : mode === "rust" ? "rust" : "js",
				run: () => void run(),
				label: `${title ?? "Playground"} code`,
				change: (t) => {
					try {
						localStorage.setItem(key, t);
					} catch {
						/* storage unavailable */
					}
				}
			});
			loaded = true;
			if (mode === "rust") void import("../playground/run-rust").then((r) => (rustLink = r.playgroundUrl(saved ?? original)));
			if (mode === "svelte" && allowed) void run();
		});
		return () => {
			alive = false;
			editor?.destroy();
			void stop(true);
		};
	});

	async function run() {
		if (!editor || !allowed) return;
		busy = true;
		await stop(true);
		lines = [];
		try {
			if (mode === "svelte") {
				const { runSvelte } = await import("../playground/run-svelte");
				preview!.replaceChildren();
				svelteRun = await runSvelte(editor.text(), preview!);
			} else if (mode === "rust") {
				const { runRust, playgroundUrl } = await import("../playground/run-rust");
				rustLink = playgroundUrl(editor.text());
				print("trace", "Compiling…");
				abort = new AbortController();
				const r = await runRust(editor.text(), abort.signal);
				lines = [];
				if (r.stderr) print(r.ok ? "trace" : "error", r.stderr);
				if (r.stdout) print("log", r.stdout.replace(/\n$/, ""));
				if (r.ok && !r.stdout) print("trace", "The program ran and printed nothing.");
			} else if (mode === "kernel") {
				const { runSandbox } = await import("../playground/run-kernel");
				running = await runSandbox(editor.text(), print, (t) => print("trace", t));
			} else {
				const { runModule } = await import("../playground/run-module");
				running = await runModule(k, editor.text(), print);
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
		editor?.set(original);
		try {
			localStorage.removeItem(key);
		} catch {
			/* storage unavailable */
		}
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
