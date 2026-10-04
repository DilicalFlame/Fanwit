<script lang="ts">
	import { ps } from "./ps.svelte";

	const SWATCHES = ["#000000", "#404040", "#808080", "#c0c0c0", "#ffffff", "#7f1d1d", "#dc2626", "#f97316", "#facc15", "#84cc16", "#16a34a", "#14b8a6", "#0ea5e9", "#2563eb", "#4f46e5", "#7c3aed", "#c026d3", "#db2777", "#fda4af", "#fed7aa", "#fef08a", "#bbf7d0", "#a5f3fc", "#c7d2fe"];
</script>

<div class="grid h-full w-full auto-rows-min grid-cols-[repeat(auto-fill,minmax(22px,1fr))] gap-1 overflow-auto bg-[#323232] p-3">
	{#each SWATCHES as c (c)}
		<button class="aspect-square rounded-sm border {ps.color === c ? 'border-white' : 'border-black/40'}" style:background={c} aria-label="Use {c}" title={c} onclick={() => (ps.color = c)}></button>
	{/each}
</div>
