<script lang="ts">
	import { getKernel, menu } from "../../ui.svelte";
	import type { GridNode } from "../../layout/model";
	import PaneSlot from "./PaneSlot.svelte";

	/** Two dimensional CSS grid of cards (dashboards). */
	let { node }: { node: string } = $props();
	const k = getKernel();
	const layout = k.sys.layout;
	const n = $derived(layout.doc.node[node] as GridNode);
	const gap = $derived(typeof n.gap === "number" ? `${n.gap}px` : (n.gap ?? "8px"));
</script>

<div class="grid min-h-0 flex-1 overflow-auto p-2" style:grid-template-columns={n.columns ?? "repeat(auto-fill, minmax(280px, 1fr))"} style:grid-template-rows={n.rows} style:gap>
	{#each n.panes as pane (pane)}
		<section class="flex min-h-40 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm" style:grid-area={layout.doc.pane[pane]?.area} aria-label={layout.paneTitle(pane)}>
			<header class="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3 text-xs font-medium" use:menu={{ location: "tab/context", target: { pane } }}>{layout.paneTitle(pane)}</header>
			<PaneSlot {pane} />
		</section>
	{/each}
</div>
