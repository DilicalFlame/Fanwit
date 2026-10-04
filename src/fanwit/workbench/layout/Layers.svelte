<script lang="ts">
	import { getKernel, uiZoom } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import PaneSlot from "./PaneSlot.svelte";
	import { enter } from "../../motion/motion";
	// entrances only: exits would keep a slot alive while its pane moves to its new place
	const DRAWER_FROM = { left: { x: -40 }, right: { x: 40 }, top: { y: -40 }, bottom: { y: 40 } } as Record<string, { x?: number; y?: number }>;

	/** Layers above the tree: floating cards, drawers and modal overlays (Section 8.3). */
	let { windowId }: { windowId: string } = $props();
	const k = getKernel();
	const layout = k.sys.layout;
	let host = $state<HTMLDivElement>();
	let w = $state(0);
	let h = $state(0);

	const floats = $derived(Object.entries(layout.doc.float ?? {}).filter(([, f]) => f.window === windowId));
	const drawers = $derived(Object.entries(layout.doc.drawer ?? {}).filter(([, d]) => d.window === windowId && d.open !== false));
	const overlays = $derived(Object.entries(layout.doc.overlay ?? {}).filter(([, o]) => o.window === windowId));

	/** Live geometry while dragging a card, committed on release. */
	let live = $state<Record<string, [number, number, number, number]>>({});

	function pos(id: string, rect: [number, number, number, number]) {
		const [x, y, cw, ch] = live[id] ?? rect;
		return { left: x < 0 ? Math.max(0, w + x) : x, top: y < 0 ? Math.max(0, h + y) : y, width: cw, height: ch };
	}

	function drag(e: PointerEvent, id: string, mode: "move" | "resize") {
		if (e.button !== 0) return;
		e.preventDefault();
		const f = layout.doc.float![id];
		const p = pos(id, f.rect);
		const sx = e.clientX;
		const sy = e.clientY;
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture(e.pointerId);
		// clamp inside the layer: a negative x/y would read as an anchor to the right/bottom edge
		const snap = (v: number, max: number) => {
			const c = Math.min(Math.max(0, v), Math.max(0, max));
			return f.snap ? (c < 12 ? 0 : c > max - 12 ? max : c) : c;
		};
		const z = uiZoom();
		const move = (ev: PointerEvent) => {
			const dx = (ev.clientX - sx) / z;
			const dy = (ev.clientY - sy) / z;
			if (mode === "move") live[id] = [snap(p.left + dx, w - p.width), snap(p.top + dy, h - p.height), p.width, p.height];
			else live[id] = [p.left, p.top, Math.max(180, p.width + dx), Math.max(120, p.height + dy)];
		};
		const up = () => {
			el.removeEventListener("pointermove", move);
			el.removeEventListener("pointerup", up);
			const r = live[id];
			delete live[id];
			if (r) void layout.dispatch({ type: "setFloat", float: id, attrs: { rect: r.map(Math.round) as [number, number, number, number] } });
		};
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerup", up);
	}

	function esc(e: KeyboardEvent) {
		if (e.key !== "Escape") return;
		const top = overlays.at(-1);
		if (top) {
			e.stopPropagation();
			void layout.dispatch({ type: "closeOverlay", overlay: top[0] });
			return;
		}
		const d = drawers.at(-1);
		if (d) {
			e.stopPropagation();
			void layout.dispatch({ type: "closeDrawer", drawer: d[0] });
		}
	}
</script>

<svelte:window onkeydown={esc} />

<div bind:this={host} bind:clientWidth={w} bind:clientHeight={h} class="pointer-events-none absolute inset-0 z-30 overflow-hidden">
	{#each floats as [id, f] (id)}
		{@const p = pos(id, f.rect)}
		<section
			use:enter={{ preset: "pop", origin: "top left" }}
			class="pointer-events-auto absolute flex flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
			style:left="{p.left}px"
			style:top="{p.top}px"
			style:width="{p.width}px"
			style:height={f.collapsed ? "auto" : `${p.height}px`}
			style:opacity={f.opacity ?? 1}
			aria-label={layout.paneTitle(f.pane)}
		>
			<!-- svelte-ignore a11y_no_static_element_interactions (drag to move; keyboard users dock or close with the buttons) -->
			<header class="flex h-8 shrink-0 cursor-move items-center gap-1 border-b border-border px-2 text-xs font-medium select-none" onpointerdown={(e) => drag(e, id, "move")}>
				<Icon name="grip-vertical" size={14} class="opacity-50" />
				<span class="flex-1 truncate">{layout.paneTitle(f.pane)}</span>
				<button class="fw-icon-btn" aria-label={f.collapsed ? "Expand" : "Collapse"} onpointerdown={(e) => e.stopPropagation()} onclick={() => layout.dispatch({ type: "setFloat", float: id, attrs: { collapsed: !f.collapsed || undefined } })}>
					<Icon name="chevron-up" size={13} class="transition-transform duration-150 {f.collapsed ? 'rotate-180' : ''}" />
				</button>
				<button class="fw-icon-btn" aria-label="Dock" title="Dock into a tab set" onpointerdown={(e) => e.stopPropagation()} onclick={() => layout.dispatch({ type: "dock", float: id })}><Icon name="panel-top" size={13} /></button>
				<button class="fw-icon-btn" aria-label="Close" onpointerdown={(e) => e.stopPropagation()} onclick={() => layout.dispatch({ type: "closePane", pane: f.pane })}><Icon name="x" size={13} /></button>
			</header>
			{#if !f.collapsed}
				<div class="relative flex min-h-0 flex-1"><PaneSlot pane={f.pane} /></div>
				<div class="absolute right-0 bottom-0 size-3 cursor-se-resize" role="presentation" onpointerdown={(e) => drag(e, id, "resize")}></div>
			{/if}
		</section>
	{/each}

	{#each drawers as [id, d] (id)}
		{#if d.modal}
			<button use:enter={"fade"} class="pointer-events-auto absolute inset-0 bg-black/30" aria-label="Close drawer" onclick={() => layout.dispatch({ type: "closeDrawer", drawer: id })}></button>
		{/if}
		{@const size = typeof d.size === "number" ? `${d.size * 100}%` : (d.size ?? "360px")}
		<aside
			use:enter={{ preset: "fade", from: { ...DRAWER_FROM[d.side ?? "left"], ease: "power3.out" } }}
			class="pointer-events-auto absolute flex flex-col border-border bg-background shadow-xl {d.side === 'left' ? 'inset-y-0 left-0 border-r' : d.side === 'right' ? 'inset-y-0 right-0 border-l' : d.side === 'top' ? 'inset-x-0 top-0 border-b' : 'inset-x-0 bottom-0 border-t'}"
			style:width={d.side === "left" || d.side === "right" ? `min(${size}, 100%)` : undefined}
			style:height={d.side === "top" || d.side === "bottom" ? `min(${size}, 100%)` : undefined}
			aria-label={layout.paneTitle(d.pane)}
		>
			<header class="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-sm font-medium">
				<span class="flex-1 truncate">{layout.paneTitle(d.pane)}</span>
				<button class="fw-icon-btn" aria-label="Close drawer" onclick={() => layout.dispatch({ type: "closeDrawer", drawer: id })}><Icon name="x" size={14} /></button>
			</header>
			<div class="relative flex min-h-0 flex-1"><PaneSlot pane={d.pane} /></div>
		</aside>
	{/each}

	{#each overlays as [id, o] (id)}
		<div
			class="pointer-events-auto absolute inset-0 flex {o.variant === 'sheet' ? 'items-end justify-center' : 'items-center justify-center'} {o.backdrop === 'none' ? '' : o.variant === 'lightbox' ? 'bg-black/80' : 'bg-black/40'} {o.backdrop === 'blur' ? 'backdrop-blur-sm' : ''}"
			role="presentation"
			use:enter={"fade"}
			onpointerdown={(e) => e.target === e.currentTarget && layout.dispatch({ type: "closeOverlay", overlay: id })}
		>
			<div
				use:enter={o.variant === "sheet" ? { preset: "fade", from: { y: 48, ease: "power3.out" } } : "dialog"}
				role="dialog"
				aria-modal="true"
				aria-label={layout.paneTitle(o.pane)}
				class="relative flex flex-col overflow-hidden bg-background shadow-2xl {o.variant === 'fullscreen'
					? 'size-full'
					: o.variant === 'sheet'
						? 'h-[60%] w-full max-w-3xl rounded-t-xl border border-border'
						: o.variant === 'lightbox'
							? 'h-[85%] w-[85%] rounded-lg bg-transparent shadow-none'
							: 'h-[min(560px,85%)] w-[min(720px,90%)] rounded-xl border border-border'}"
			>
				<header class="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-sm font-medium" class:hidden={o.variant === "lightbox"}>
					<span class="flex-1 truncate">{layout.paneTitle(o.pane)}</span>
					<button class="fw-icon-btn" aria-label="Close" onclick={() => layout.dispatch({ type: "closeOverlay", overlay: id })}><Icon name="x" size={14} /></button>
				</header>
				<div class="relative flex min-h-0 flex-1"><PaneSlot pane={o.pane} /></div>
			</div>
		</div>
	{/each}
</div>
