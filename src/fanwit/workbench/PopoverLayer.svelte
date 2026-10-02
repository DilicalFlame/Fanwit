<script lang="ts">
	import { getKernel } from "../ui.svelte";
	import WindowView from "./WindowView.svelte";

	/** In page popovers anchored to elements and transient flyouts (Section 9.10). */
	const k = getKernel();
	const layers = k.sys.layers;

	function pos(a: DOMRect, side: string, align: string) {
		const gap = 6;
		const x = align === "end" ? a.right : align === "center" ? a.left + a.width / 2 : a.left;
		if (side === "top") return `left:${x}px;bottom:${window.innerHeight - a.top + gap}px`;
		if (side === "right") return `left:${a.right + gap}px;top:${a.top}px`;
		if (side === "left") return `right:${window.innerWidth - a.left + gap}px;top:${a.top}px`;
		return `left:${x}px;top:${a.bottom + gap}px`;
	}
	const self = (id: string, view: string, props: Record<string, unknown>) => ({ label: id, kind: view, props, opener: null, close: async () => layers.closePopover(id), setTitle: () => {} });
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && layers.popovers.length && layers.closePopover(layers.popovers.at(-1)!.id)} />

{#each layers.popovers as p (p.id)}
	<button class="fixed inset-0 z-[84] cursor-default" aria-label="Close popover" tabindex="-1" onclick={() => layers.closePopover(p.id)}></button>
	<div role="dialog" class="fixed z-[85] max-w-sm rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-xl {p.align === 'center' ? '-translate-x-1/2' : p.align === 'end' ? '-translate-x-full' : ''}" style={pos(p.anchor, p.side, p.align)}>
		<WindowView view={p.view} props={p.props} self={self(p.id, p.view, p.props)} />
	</div>
{/each}
{#each layers.flyouts as f (f.id)}
	<div
		role="status"
		class="pointer-events-none fixed z-[86] rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-lg {f.placement === 'center' ? 'top-1/2 left-1/2 -translate-1/2' : f.placement === 'bottom' ? 'bottom-10 left-1/2 -translate-x-1/2' : ''}"
		style:left={f.placement === "cursor" ? `${f.x + 12}px` : undefined}
		style:top={f.placement === "cursor" ? `${f.y + 12}px` : undefined}
	>
		{#if k.sys.layout.views.has(f.view)}
			<WindowView view={f.view} props={f.props} self={self(f.id, f.view, f.props)} />
		{:else}
			{f.view}
		{/if}
	</div>
{/each}
