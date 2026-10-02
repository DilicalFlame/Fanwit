<script lang="ts">
	/** Platform aware rendering of a binding (Cmd symbols on macOS). One chip per chord step. */
	let { keys, class: cls = "" }: { keys?: string[] | null; class?: string } = $props();
</script>

{#if keys?.length}
	<span class="inline-flex items-center gap-1 {cls}">
		{#each keys as k, i (i)}
			<kbd class="rounded border border-border bg-muted/60 px-1 py-px font-sans text-[10.5px] leading-none text-muted-foreground">{k}</kbd>
		{/each}
	</span>
{/if}
