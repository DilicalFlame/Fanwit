<script lang="ts">
	import { onDestroy } from "svelte";
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import type { ExecRecord } from "../../commands/types";

	/** Command log: every invocation with source, args, duration, result or error; replay a row. */
	const k = getKernel();
	let records = $state.raw<ExecRecord[]>([]);
	const d = k.commands.onDidExecute.on((r) => (records = [r, ...records].slice(0, 300)));
	onDestroy(() => d.dispose());
</script>

<div class="selectable h-full overflow-auto px-2 font-mono text-[11px]">
	{#each records as r, i (i)}
		<div class="group flex items-center gap-2 border-b border-border/40 py-0.5">
			<span class="text-muted-foreground">{new Date(r.time).toLocaleTimeString(undefined, { hour12: false })}</span>
			<Icon name={r.ok ? "check" : "x"} size={12} class={r.ok ? "text-success" : "text-destructive"} />
			<span class="w-16 shrink-0 text-info">{r.source}</span>
			<span class="font-semibold">{r.id}</span>
			<span class="truncate text-muted-foreground">{Object.keys(r.args).length ? JSON.stringify(r.args) : ""}</span>
			<span class="truncate {r.ok ? 'text-muted-foreground' : 'text-destructive'}">{r.ok ? (r.result === undefined ? "" : `→ ${JSON.stringify(r.result)?.slice(0, 80)}`) : String((r.error as Error)?.message ?? r.error)}</span>
			<span class="ml-auto shrink-0 text-muted-foreground">{r.ms} ms</span>
			<button class="fw-icon-btn size-5 opacity-0 group-hover:opacity-100" aria-label="Replay" title="Replay" onclick={() => k.commands.run(r.id, r.args, { source: "api" }).catch((e) => k.sys.notify.error(e))}><Icon name="rotate-cw" size={11} /></button>
		</div>
	{:else}
		<div class="py-4 text-center text-muted-foreground">Run any command; it shows up here.</div>
	{/each}
</div>
