<script lang="ts">
	import { getKernel } from "../ui.svelte";
	import EmptyState from "../workbench/EmptyState.svelte";

	/** Properties of the active pane: view, props, file metadata. Bound to the active tab. */
	const k = getKernel();
	const { layout, vault } = k.sys;
	const pane = $derived(layout.activePane ? { id: layout.activePane, ...layout.doc.pane[layout.activePane] } : null);
	let stat = $state<{ size: number; mtime: number } | null>(null);
	$effect(() => {
		const p = pane?.props?.path as string | undefined;
		stat = null;
		if (p && vault.current) vault.fs.stat(p).then((s) => (stat = s)).catch(() => {});
	});
</script>

{#if !pane?.view}
	<EmptyState icon="sliders-horizontal" title="Nothing selected" description="Properties of the active tab appear here." />
{:else}
	<dl class="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1.5 p-3 text-xs">
		<dt class="text-muted-foreground">Title</dt><dd class="selectable truncate">{layout.paneTitle(pane.id)}</dd>
		<dt class="text-muted-foreground">View</dt><dd class="selectable truncate font-mono">{pane.view}</dd>
		<dt class="text-muted-foreground">Pane id</dt><dd class="selectable font-mono">{pane.id}</dd>
		{#if pane.props && Object.keys(pane.props).length}
			{#each Object.entries(pane.props) as [key, value] (key)}
				<dt class="text-muted-foreground">{key}</dt><dd class="selectable truncate">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
			{/each}
		{/if}
		{#if stat}
			<dt class="text-muted-foreground">Size</dt><dd>{stat.size.toLocaleString()} bytes</dd>
			<dt class="text-muted-foreground">Modified</dt><dd>{stat.mtime ? new Date(stat.mtime).toLocaleString() : "unknown"}</dd>
		{/if}
		<dt class="text-muted-foreground">State</dt><dd>{layout.dirty[pane.id] ? "Unsaved changes" : "Saved"}{pane.pinned ? " · pinned" : ""}{pane.preview ? " · preview" : ""}</dd>
	</dl>
{/if}
