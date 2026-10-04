<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import { manualState } from "../../manual/state.svelte";

	/**
	 * "On this page" (MDN style): every heading whose section is on screen is highlighted, with a
	 * bar spanning the visible range; sections already read are ticked off.
	 */
	const k = getKernel();
	const st = manualState(k);
	const o = $derived(st.outline?.pane === st.activePane ? st.outline : null);
	const items = $derived(o?.headings.filter((h) => h.level > 1 && h.level < 4) ?? []);
	const visible = $derived(new Set(o?.visible ?? []));
	const read = $derived(new Set(o?.read ?? []));
	/** First and last visible rows: the bar spans them. */
	const span = $derived.by(() => {
		const idx = items.map((h, i) => (visible.has(h.id) ? i : -1)).filter((i) => i >= 0);
		return idx.length ? { from: idx[0], to: idx.at(-1)! } : null;
	});
	const ROW = 26;
</script>

<aside class="flex h-full min-h-0 w-full flex-col bg-sidebar text-xs" aria-label="On this page">
	{#if o}
		<div class="fw-section-title flex items-center">On this page<span class="ml-auto font-normal tracking-normal normal-case tabular-nums">{Math.round(o.progress * 100)}%</span></div>
		<div class="mx-3 mb-2 h-0.5 overflow-hidden rounded bg-border" aria-hidden="true"><div class="h-full bg-primary transition-[width] duration-(--duration-fast)" style:width="{o.progress * 100}%"></div></div>
		{#if items.length}
			<div class="relative min-h-0 flex-1 overflow-auto pr-2 pb-4">
				{#if span}
					<div class="absolute left-3 w-0.5 rounded bg-primary transition-[top,height] duration-(--duration-base)" style:top="{span.from * ROW + 3}px" style:height="{(span.to - span.from + 1) * ROW - 6}px" aria-hidden="true"></div>
				{/if}
				{#each items as h (h.id)}
					<button
						class="flex w-full items-center truncate text-left transition-colors {visible.has(h.id) ? 'font-medium text-foreground' : read.has(h.id) ? 'text-muted-foreground/70' : 'text-muted-foreground'} hover:text-foreground"
						style:height="{ROW}px"
						style:padding-left="{20 + (h.level - 2) * 12}px"
						aria-current={visible.has(h.id) ? "location" : undefined}
						onclick={() => (st.jump = { key: o.key, anchor: h.id, n: Date.now() })}
					>
						<span class="truncate">{h.text}</span>
					</button>
				{/each}
			</div>
		{:else}
			<p class="px-3 text-muted-foreground">This page has no sections.</p>
		{/if}
	{:else}
		<p class="px-3 pt-3 text-muted-foreground">Open a page to see its outline.</p>
	{/if}
</aside>
