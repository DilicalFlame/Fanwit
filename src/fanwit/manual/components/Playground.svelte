<script lang="ts">
	import { untrack, type Snippet } from "svelte";
	import { buildMode } from "virtual:fw-docs";
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import type { Editor } from "../playground/editor";
	import type { ModuleRun } from "../playground/run-module";
	import type { SvelteRun } from "../playground/run-svelte";

	/**
	 * A playground. Put one code block inside; it becomes an editor.
	 *
	 * - `mode="module"`: JavaScript that `export default`s a module. Run registers it in the live
	 *   app (its commands appear in the palette); Stop disposes everything it added.
	 * - `mode="svelte"`: a Svelte component, compiled in the browser and rendered beside the code.
	 *
	 * Running code is for development and the docs site; production builds show the code read only
	 * unless developer mode is on.
	 */
	let { mode = "module", title, height = 260, children }: { mode?: "module" | "svelte"; title?: string; height?: number; children?: Snippet } = $props();
	const k = getKernel();
	let source = $state<HTMLElement>();
	let host = $state<HTMLElement>();
	let preview = $state<HTMLElement>();
	let editor: Editor | null = null;
	let original = "";
	let lines = $state<{ kind: "log" | "error"; text: string }[]>([]);
	let running = $state<ModuleRun | null>(null);
	let svelteRun: SvelteRun | null = null;
	let busy = $state(false);
	let loaded = $state(false);
	const allowed = $derived(buildMode !== "prod" || !!k.context.lookup(null)("devMode"));
	// saved edits are per page and playground; the props name it once
	const key = untrack(() => `fw-play:${location.search}:${title ?? ""}:${mode}`);

	const print = (kind: "log" | "error", text: string) => (lines = [...lines.slice(-50), { kind, text }]);

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
				lang: mode === "svelte" ? "svelte" : "js",
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
			} else {
				const { runModule } = await import("../playground/run-module");
				running = await runModule(k, editor.text(), print);
			}
		} catch (e) {
			const err = e as Error & { line?: number; column?: number };
			print("error", `${err.line ? `Line ${err.line}:${err.column ?? 0}: ` : ""}${err.message}`);
		} finally {
			busy = false;
		}
	}
	async function stop(quiet = false) {
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
</script>

<div class="fw-play fw-widget" data-mode={mode}>
	<div class="fw-play-bar">
		<Icon name={mode === "svelte" ? "component" : "blocks"} size={14} />
		<span class="fw-play-title">{title ?? (mode === "svelte" ? "Svelte playground" : "Module playground")}</span>
		{#if allowed}
			<button type="button" class="fw-play-btn primary" disabled={!loaded || busy} onclick={run} title="Run (Ctrl+Enter)"><Icon name="play" size={13} />{mode === "module" && running ? "Run again" : "Run"}</button>
			{#if running}<button type="button" class="fw-play-btn" onclick={() => stop()}><Icon name="square" size={12} />Stop</button>{/if}
		{:else}
			<span class="fw-play-note">Read only: turn on developer mode to run it.</span>
		{/if}
		<button type="button" class="fw-play-btn" onclick={reset} title="Back to the original code"><Icon name="rotate-ccw" size={12} />Reset</button>
	</div>
	<div class="fw-play-main" style:height="{height}px">
		<div class="fw-play-editor" bind:this={host}></div>
		<div class="fw-play-out" aria-live="polite">
			{#if mode === "svelte"}<div class="fw-play-preview" bind:this={preview}></div>{/if}
			{#if mode === "module" && running?.commands.length}
				<div class="fw-play-cmds">
					{#each running.commands as c (c.id)}
						<button type="button" class="fw-play-btn" onclick={() => k.commands.run(c.id, {}, { source: "api", interactive: true }).catch((e) => print("error", (e as Error).message))}><Icon name="square-terminal" size={12} />{c.title}</button>
					{/each}
				</div>
			{/if}
			{#each lines as l, i (i)}<div class="fw-play-line" class:error={l.kind === "error"}>{l.text}</div>{/each}
			{#if mode === "module" && !running && !lines.length}<div class="fw-play-line muted">Press Run (Ctrl+Enter): the module joins the running app.</div>{/if}
		</div>
	</div>
	<div hidden bind:this={source}>{@render children?.()}</div>
</div>
