<script lang="ts">
	import { dash, fmt, rng } from "./data.svelte";

	/** Horizontal bars per region for the selected range. */
	const REGIONS = ["North America", "Europe", "Asia Pacific", "Latin America", "Africa"];
	const rows = $derived.by(() => {
		const r = rng(dash.range * 3);
		return REGIONS.map((name) => ({ name, value: Math.round((2 + r() * 10) * dash.range * 40) })).sort((a, b) => b.value - a.value);
	});
	const max = $derived(Math.max(...rows.map((x) => x.value)));
	const COLORS = ["#6366f1", "#0ea5e9", "#14b8a6", "#f59e0b", "#ec4899"];
</script>

<div class="flex h-full w-full flex-col justify-center gap-2.5 p-3 text-xs">
	{#each rows as row, i (row.name)}
		<div class="grid grid-cols-[96px_1fr_64px] items-center gap-2">
			<span class="truncate text-muted-foreground">{row.name}</span>
			<div class="h-3 rounded bg-muted"><div class="h-full rounded transition-[width] duration-500" style:width="{(row.value / max) * 100}%" style:background={COLORS[i]}></div></div>
			<span class="text-right font-medium tabular-nums">${fmt(row.value)}</span>
		</div>
	{/each}
</div>
