<script lang="ts">
	import { getKernel, menu } from "../../ui.svelte";
	import type { TabsNode } from "../../layout/model";
	import Icon from "../../icons/Icon.svelte";
	import PaneSlot from "./PaneSlot.svelte";
	import EmptyState from "../EmptyState.svelte";
	import KeyChip from "../KeyChip.svelte";
	import { gsap } from "gsap";
	import { enter, reduced } from "../../motion/motion";

	/**
	 * A tab set: strip with overflow (wheel scroll and an overflow list), pinned tabs (icon only,
	 * left), preview tabs (italic), dirty dots, middle click close, double click maximise, drag to
	 * reorder or dock, and the tab/context menu location.
	 */
	let { node, region }: { node: string; region: string } = $props();
	const k = getKernel();
	const layout = k.sys.layout;
	const n = $derived(layout.doc.node[node] as TabsNode);
	const panes = $derived([...n.panes].sort((a, b) => Number(!!layout.doc.pane[b]?.pinned) - Number(!!layout.doc.pane[a]?.pinned)));
	const active = $derived(n.active && n.panes.includes(n.active) ? n.active : n.panes[0]);
	const focused = $derived(layout.activeTabset === node);
	const strip = $derived(n.strip ?? (region === "panel" || region === "main" ? "top" : "top"));
	const closeButton = $derived(k.sys.settings.get<string>("layout.closeButton"));
	let stripEl = $state<HTMLDivElement>();
	let overflowOpen = $state(false);
	let overflowing = $state(false);

	function select(p: string) {
		void layout.dispatch({ type: "selectPane", pane: p }, { undoable: false });
	}
	async function close(p: string, e?: Event) {
		e?.stopPropagation();
		await k.commands.run("tab.close", {}, { source: "toolbar", target: { pane: p } }).catch((err) => k.sys.notify.error(err));
	}
	function wheel(e: WheelEvent) {
		if (!stripEl || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
		stripEl.scrollLeft += e.deltaY;
		e.preventDefault();
	}
	function keys(e: KeyboardEvent, i: number) {
		const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
		if (dir) {
			e.preventDefault();
			const next = panes[(i + dir + panes.length) % panes.length];
			select(next);
			queueMicrotask(() => stripEl?.querySelector<HTMLElement>(`[data-fw-tab="${next}"]`)?.focus());
		} else if (e.key === "Delete") void close(panes[i]);
		else if (e.key === "Enter") layout.focusPane(panes[i]);
	}
	$effect(() => {
		void panes.length;
		if (!stripEl) return;
		const ro = new ResizeObserver(() => (overflowing = !!stripEl && stripEl.scrollWidth > stripEl.clientWidth + 1));
		ro.observe(stripEl);
		return () => ro.disconnect();
	});
	$effect(() => {
		// keep the active tab visible
		const a = active;
		queueMicrotask(() => stripEl?.querySelector<HTMLElement>(`[data-fw-tab="${a}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
	});

	// one underline that slides to the active tab (and follows its width as titles change)
	let indicator = $state<HTMLSpanElement>();
	let stripReady = $state(false);
	$effect(() => {
		const id = active;
		void panes.length;
		const strip = stripEl;
		const ind = indicator;
		if (!strip || !ind || !id) return;
		const tab = strip.querySelector<HTMLElement>(`[data-fw-tab="${CSS.escape(id)}"]`);
		if (!tab) return;
		let first = !stripReady;
		const move = () => {
			gsap.to(ind, { x: tab.offsetLeft, width: tab.offsetWidth, duration: first || reduced() ? 0 : 0.22, ease: "power3.out" });
			first = false;
		};
		move();
		const ro = new ResizeObserver(move);
		ro.observe(tab);
		if (!stripReady) requestAnimationFrame(() => (stripReady = true));
		return () => ro.disconnect();
	});
</script>

<div class="flex min-h-0 min-w-0 flex-1 flex-col bg-background" data-fw-tabset={node} class:fw-focused={focused}>
	{#if strip !== "hidden" && panes.length}
		<div class="flex shrink-0 items-stretch border-b border-border bg-tab" style:height="var(--tab-h)">
			<div bind:this={stripEl} role="tablist" aria-label="Tabs" class="relative flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none]" data-fw-strip={node} onwheel={wheel}>
				<span bind:this={indicator} aria-hidden="true" class="pointer-events-none absolute top-0 left-0 z-10 h-0.5 w-0 bg-tab-border transition-opacity duration-150" style:opacity={focused ? 1 : 0}></span>
				{#each panes as p, i (p)}
					{@const pane = layout.doc.pane[p]}
					{@const isActive = p === active}
					{@const view = pane ? layout.views.get(pane.view) : undefined}
					<div
						role="tab"
						tabindex={isActive ? 0 : -1}
						aria-selected={isActive}
						data-fw-tab={p}
						data-fw-id="tab"
						title={layout.paneTitle(p) + (layout.dirty[p] ? " (unsaved)" : "")}
						class="group relative flex max-w-56 min-w-0 shrink-0 cursor-default items-center gap-1.5 border-r border-border px-3 text-[12.5px] select-none {isActive
							? 'bg-tab-active text-foreground'
							: 'text-tab-foreground/70 hover:bg-tab-active/50'}"
						style:border-top={pane?.group ? `2px solid ${pane.group}` : undefined}
						onpointerdown={(e) => {
							if (e.button === 1) e.preventDefault();
							else if (e.button === 0) {
								select(p);
								if (!n.locked) k.sys.dock.begin(e, p, layout.paneTitle(p));
							}
						}}
						onauxclick={(e) => e.button === 1 && !pane?.pinned && close(p)}
						ondblclick={() => layout.dispatch({ type: "maximize", node })}
						onkeydown={(e) => keys(e, i)}
						use:menu={{ location: "tab/context", target: { pane: p, view: pane?.view, path: pane?.props?.path } }}
						use:enter={{ preset: "row", when: stripReady }}
					>
						{#if pane?.icon || view?.icon}<Icon name={pane?.icon ?? view?.icon} size={14} class="opacity-80" />{/if}
						{#if !pane?.pinned}
							<span class="truncate" class:italic={pane?.preview}>{layout.paneTitle(p)}</span>
						{/if}
						{#if layout.dirty[p]}
							<span class="size-2 shrink-0 rounded-full bg-foreground/60 group-hover:hidden" aria-label="unsaved"></span>
						{/if}
						{#if !pane?.pinned && closeButton !== "hidden" && n.closable !== false}
							<button
								class="fw-icon-btn size-5 shrink-0 {isActive || layout.dirty[p] ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'} {layout.dirty[p] ? 'hidden group-hover:inline-flex' : ''}"
								aria-label="Close {layout.paneTitle(p)}"
								tabindex="-1"
								onpointerdown={(e) => e.stopPropagation()}
								onclick={(e) => close(p, e)}><Icon name="x" size={13} /></button
							>
						{:else if pane?.pinned}
							<Icon name="pin" size={11} class="opacity-50" />
						{/if}
					</div>
				{/each}
			</div>
			<div class="flex shrink-0 items-center gap-0.5 px-1">
				{#if overflowing}
					<div class="relative">
						<button class="fw-icon-btn" aria-label="Show all tabs" aria-expanded={overflowOpen} onclick={() => (overflowOpen = !overflowOpen)}><Icon name="chevrons-down" size={14} /></button>
						{#if overflowOpen}
							<div role="menu" tabindex="-1" class="absolute right-0 top-7 z-50 min-w-48 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg" onfocusout={() => setTimeout(() => (overflowOpen = false), 150)}>
								{#each panes as p (p)}
									<button role="menuitem" class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent" onclick={() => { select(p); overflowOpen = false; }}>
										<span class="truncate" class:font-semibold={p === active}>{layout.paneTitle(p)}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
				{#if region === "main"}
					<button class="fw-icon-btn" aria-label="Split right" title="Split right" onclick={() => layout.dispatch({ type: "split", node, dir: "row" })}><Icon name="columns-2" size={14} /></button>
				{/if}
				{#if region === "panel"}
					<button class="fw-icon-btn" aria-label="Maximize panel" title="Maximize panel" onclick={() => layout.dispatch({ type: "maximize", node })}><Icon name="chevron-up" size={14} /></button>
					<button class="fw-icon-btn" aria-label="Close panel" title="Close panel" onclick={() => layout.dispatch({ type: "toggleRegion", region: "panel", visible: false })}><Icon name="x" size={14} /></button>
				{/if}
			</div>
		</div>
	{/if}
	<div class="relative flex min-h-0 flex-1 flex-col">
		{#if !panes.length}
			<div use:menu={{ location: "workbench/empty" }} class="flex flex-1">
				{#if region === "main"}
					<EmptyState icon="layout-panel-top" title="Nothing open" description="Open something from the explorer or the command palette.">
						<button class="fw-btn" onclick={() => k.commands.run("palette.quickOpen")}>Quick open <KeyChip keys={k.keys.label("palette.quickOpen")} /></button>
						<button class="fw-btn" onclick={() => k.commands.run("palette.open")}>All commands <KeyChip keys={k.keys.label("palette.open")} /></button>
					</EmptyState>
				{:else}
					<EmptyState icon="inbox" title="Empty" description="Drag a tab here." />
				{/if}
			</div>
		{/if}
		{#each panes as p (p)}
			{@const keepAlive = layout.views.get(layout.doc.pane[p]?.view)?.keepAlive ?? "dom"}
			{#if p === active || keepAlive !== "none"}
				<PaneSlot pane={p} hidden={p !== active} />
			{/if}
		{/each}
	</div>
</div>
