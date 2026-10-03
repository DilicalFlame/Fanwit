<script lang="ts">
	import { getKernel } from "../ui.svelte";

	/** Context keys viewer (dev tools): every key with its value for the focused element, live. */
	const k = getKernel();
	let q = $state("");
	let clause = $state("");
	const snapshot = $derived((void k.context.version, k.context.snapshot(null)));
	const rows = $derived(
		Object.entries(snapshot)
			.filter(([key]) => !q || key.toLowerCase().includes(q.toLowerCase()))
			.sort(([a], [b]) => a.localeCompare(b))
	);
	const truth = $derived.by(() => {
		void k.context.version;
		if (!clause.trim()) return null;
		try {
			return k.context.evaluate(clause) ? "true" : "false";
		} catch (e) {
			return (e as Error).message;
		}
	});
</script>

<div class="flex h-full flex-col text-xs">
	<div class="flex flex-col gap-1 p-2">
		<input class="fw-input h-7 text-xs" placeholder="Filter keys" aria-label="Filter keys" bind:value={q} />
		<input class="fw-input h-7 font-mono text-xs" placeholder="Try a when clause: vault.open && !inputFocus" aria-label="When clause" bind:value={clause} />
		{#if truth !== null}<div class="font-mono {truth === 'true' ? 'text-success' : truth === 'false' ? 'text-muted-foreground' : 'text-destructive'}">→ {truth}</div>{/if}
	</div>
	<div class="min-h-0 flex-1 overflow-auto px-2 pb-2 font-mono">
		{#each rows as [key, value] (key)}
			<div class="flex gap-2 border-b border-border/50 py-0.5"><span class="w-1/2 truncate text-muted-foreground" title={key}>{key}</span><span class="selectable flex-1 truncate">{JSON.stringify(value)}</span></div>
		{/each}
	</div>
</div>
