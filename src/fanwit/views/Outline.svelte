<script lang="ts">
	import { getKernel } from "../ui.svelte";
	import EmptyState from "../workbench/EmptyState.svelte";

	/** Heading outline of the active document (Markdown headings), click to reveal. */
	const k = getKernel();
	const { layout, vault } = k.sys;
	const path = $derived(layout.activeDocument ? (layout.doc.pane[layout.activeDocument]?.props?.path as string | undefined) : undefined);
	let text = $state("");
	$effect(() => {
		const p = path;
		void k.context.version;
		text = "";
		if (p && vault.current) vault.fs.readText(p).then((t) => (text = t)).catch(() => {});
	});
	const headings = $derived(
		text
			.split(/\r?\n/)
			.map((l, line) => ({ m: /^(#{1,6})\s+(.*)$/.exec(l), line }))
			.filter((x) => x.m)
			.map((x) => ({ level: x.m![1].length, title: x.m![2], line: x.line + 1 }))
	);
</script>

{#if !headings.length}
	<EmptyState icon="list-tree" title="No outline" description="Headings of the active document appear here." />
{:else}
	<ul class="h-full overflow-auto py-1 text-[13px]" role="tree" aria-label="Outline">
		{#each headings as h, i (i)}
			<li role="treeitem" aria-selected="false" aria-level={h.level}>
				<button class="w-full truncate px-2 py-0.5 text-left hover:bg-sidebar-accent/60" style:padding-left="{8 + (h.level - 1) * 12}px" onclick={() => k.events.emit("editor:reveal" as never, { path, line: h.line } as never)}>{h.title}</button>
			</li>
		{/each}
	</ul>
{/if}
