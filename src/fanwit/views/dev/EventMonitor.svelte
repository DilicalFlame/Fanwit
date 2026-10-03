<script lang="ts">
	import { onDestroy } from "svelte";
	import { getKernel } from "../../ui.svelte";
	import type { BusRecord } from "../../kernel/events";

	/** Event monitor: kernel and app events with payloads, filterable by name and scope. */
	const k = getKernel();
	let records = $state.raw<BusRecord[]>([]);
	let filter = $state("");
	let paused = $state(false);
	const d = k.events.onAny.on((r) => {
		if (!paused) records = [r, ...records].slice(0, 500);
	});
	onDestroy(() => d.dispose());
	const shown = $derived(records.filter((r) => !filter || r.name.includes(filter) || r.scope === filter));
</script>

<div class="flex h-full flex-col text-xs">
	<div class="flex items-center gap-2 border-b border-border px-2 py-1">
		<input class="fw-input h-6 max-w-60 text-xs" placeholder="Filter by name or scope" bind:value={filter} />
		<label class="flex items-center gap-1"><input type="checkbox" bind:checked={paused} />Pause</label>
		<button class="fw-btn h-6" onclick={() => (records = [])}>Clear</button>
	</div>
	<div class="selectable min-h-0 flex-1 overflow-auto px-2 font-mono text-[11px]">
		{#each shown as r, i (i)}
			<div class="flex gap-2 border-b border-border/40 py-0.5">
				<span class="text-muted-foreground">{new Date(r.time).toLocaleTimeString(undefined, { hour12: false })}</span>
				<span class="w-12 shrink-0 text-info">{r.scope}</span>
				<span class="font-semibold">{r.name}</span>
				<span class="truncate text-muted-foreground">{JSON.stringify(r.payload)?.slice(0, 200)}</span>
				<span class="ml-auto shrink-0 text-muted-foreground">{r.origin}</span>
			</div>
		{:else}
			<div class="py-4 text-center text-muted-foreground">Events appear here as they happen.</div>
		{/each}
	</div>
</div>
