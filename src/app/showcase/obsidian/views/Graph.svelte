<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import { activeNote, linksOf, openNote, vault } from "./obsidian.svelte";

	/** Graph of every note and link; the focused note is highlighted. Click a node to open it. */
	const k = getKernel();
	let w = $state(280);
	let h = $state(280);
	const paths = $derived(Object.keys(vault.notes));
	const pos = $derived(
		Object.fromEntries(
			paths.map((p, i) => {
				const a = (i / paths.length) * Math.PI * 2 - Math.PI / 2;
				const r = Math.min(w, h) * 0.34;
				return [p, { x: w / 2 + Math.cos(a) * r, y: h / 2 + Math.sin(a) * r }];
			})
		)
	);
	const edges = $derived(paths.flatMap((p) => linksOf(vault.notes[p]).filter((t) => pos[t]).map((t) => [p, t])));
	const active = $derived(activeNote(k));
</script>

<div class="relative h-full w-full overflow-hidden" bind:clientWidth={w} bind:clientHeight={h}>
	<svg class="absolute inset-0 size-full" role="img" aria-label="Graph of notes">
		{#each edges as [a, b], i (i)}
			<line x1={pos[a].x} y1={pos[a].y} x2={pos[b].x} y2={pos[b].y} class="stroke-muted-foreground/40" stroke-width={a === active || b === active ? 2 : 1} />
		{/each}
	</svg>
	{#each paths as p (p)}
		<button class="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5" style:left="{pos[p].x}px" style:top="{pos[p].y}px" onclick={() => openNote(k, p)}>
			<span class="block size-3 rounded-full {p === active ? 'bg-violet-500 ring-4 ring-violet-500/30' : 'bg-muted-foreground'}"></span>
			<span class="max-w-24 truncate text-[10px] text-muted-foreground">{p.split("/").pop()!.replace(/\.md$/, "")}</span>
		</button>
	{/each}
</div>
