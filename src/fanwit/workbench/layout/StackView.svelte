<script lang="ts">
	import { getKernel, menu } from "../../ui.svelte";
	import type { StackNode } from "../../layout/model";
	import Icon from "../../icons/Icon.svelte";
	import PaneSlot from "./PaneSlot.svelte";

	/** View container: collapsible sections stacked vertically; sections drag into tab sets. */
	let { node, region }: { node: string; region: string } = $props();
	const k = getKernel();
	const layout = k.sys.layout;
	const n = $derived(layout.doc.node[node] as StackNode);

	function toggle(p: string) {
		const collapsed = !!layout.doc.pane[p]?.collapsed;
		void layout.dispatch({ type: "setAttrs", table: "pane", id: p, attrs: { collapsed: collapsed ? undefined : true } }, { undoable: false });
	}
</script>

<div class="flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar text-sidebar-foreground" data-fw-tabset={node}>
	{#if region === "sidebar" || region === "inspector"}
		<div class="flex h-9 shrink-0 items-center justify-between px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase" use:menu={{ location: "activity/item", target: { node } }}>
			<span>{n.title ?? node}</span>
		</div>
	{/if}
	<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
		{#each n.panes as p (p)}
			{@const pane = layout.doc.pane[p]}
			{@const collapsed = !!pane?.collapsed && n.panes.length > 1}
			<section class="flex min-h-0 flex-col border-t border-sidebar-border first:border-t-0" class:flex-1={!collapsed} aria-label={layout.paneTitle(p)}>
				{#if n.panes.length > 1}
					<button
						class="flex h-6 w-full shrink-0 items-center gap-1 px-1 text-left text-[11px] font-semibold tracking-wide uppercase hover:bg-sidebar-accent/50"
						aria-expanded={!collapsed}
						onclick={() => toggle(p)}
						onpointerdown={(e) => e.button === 0 && k.sys.dock.begin(e, p, layout.paneTitle(p))}
						use:menu={{ location: "tab/context", target: { pane: p, view: pane?.view } }}
					>
						<Icon name="chevron-right" size={14} class="transition-transform duration-150 {collapsed ? '' : 'rotate-90'}" />
						<span class="truncate">{layout.paneTitle(p)}</span>
					</button>
				{/if}
				{#if !collapsed}
					<div class="flex min-h-0 flex-1"><PaneSlot pane={p} /></div>
				{/if}
			</section>
		{/each}
	</div>
</div>
