<script lang="ts">
	import { getKernel, uiZoom } from "../ui.svelte";
	import { enter, leave } from "../motion/motion";
	import Icon from "../icons/Icon.svelte";
	import WindowView from "./WindowView.svelte";
	import type { VirtualWindow } from "../windows/windows.svelte";
	import LayoutRoot from "./layout/LayoutRoot.svelte";

	/**
	 * Web host window manager (Section 8.12): virtual windows are draggable, resizable cards with
	 * a title bar, z order, focus ring, minimise to a dock strip, maximise to the viewport and
	 * keyboard cycling (Alt+`). Modal windows put an inert veil over everything else.
	 */
	const k = getKernel();
	const w = k.sys.windows;
	const sorted = $derived([...w.virtual].sort((a, b) => a.z - b.z));
	const topModal = $derived([...w.virtual].filter((v) => v.modal).sort((a, b) => b.z - a.z)[0]);
	const minimized = $derived(w.virtual.filter((v) => v.minimized));

	function drag(e: PointerEvent, v: VirtualWindow, mode: "move" | "resize") {
		if (e.button !== 0 || v.maximized) return;
		e.preventDefault();
		w.raise(v.id);
		const sx = e.clientX;
		const sy = e.clientY;
		const r0 = { ...v.rect };
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture(e.pointerId);
		const z = uiZoom();
		const move = (ev: PointerEvent) => {
			const dx = (ev.clientX - sx) / z;
			const dy = (ev.clientY - sy) / z;
			if (mode === "move") {
				v.rect.x = Math.min(window.innerWidth / z - 80, Math.max(-r0.w + 80, r0.x + dx));
				v.rect.y = Math.min(window.innerHeight / z - 32, Math.max(0, r0.y + dy));
			} else {
				v.rect.w = Math.max(240, r0.w + dx);
				v.rect.h = Math.max(160, r0.h + dy);
			}
		};
		const up = () => {
			el.removeEventListener("pointermove", move);
			el.removeEventListener("pointerup", up);
		};
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerup", up);
	}

	function selfFor(v: VirtualWindow) {
		return {
			label: v.id,
			kind: v.kind,
			props: v.props,
			opener: v.opener,
			close: async (value?: unknown) => w.closeVirtual(v.id, value),
			setTitle: (t: string) => (v.title = t)
		};
	}

</script>

{#if topModal}
	<!-- clicks on the locked parent: bell and shake on the modal -->
	<div use:enter={"fade"} out:leave|global class="fixed inset-0 z-[60] {topModal.spec.dimParent === false ? '' : 'bg-black/30'}" role="presentation" onpointerdown={() => w.blocked()}></div>
{/if}

{#each sorted as v (v.id)}
	{#if !v.minimized}
		{@const r = v.maximized ? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight } : v.rect}
		<div
			role="dialog"
			aria-modal={v.modal}
			aria-label={v.title}
			tabindex="-1"
			use:enter={"dialog"}
			out:leave|global={{ preset: "dialog" }}
			class="fixed flex flex-col overflow-hidden border border-border bg-background text-foreground shadow-2xl {v.maximized ? '' : 'rounded-xl'} {v.feedback === 'shake' ? 'fw-shake' : ''} {v.feedback === 'flash' ? 'fw-flash' : ''}"
			style:left="{r.x}px"
			style:top="{r.y}px"
			style:width="{r.w}px"
			style:height="{r.h}px"
			style:z-index={v.modal ? 61 + v.z : 40 + v.z}
			onpointerdown={() => w.raise(v.id)}
		>
			<!-- svelte-ignore a11y_no_static_element_interactions (drag to move, double click to maximize; the buttons do the same by keyboard) -->
			<header class="flex h-8 shrink-0 cursor-move items-center gap-2 border-b border-border bg-titlebar px-2 text-xs select-none" onpointerdown={(e) => drag(e, v, "move")} ondblclick={() => (v.maximized = !v.maximized)}>
				<span class="flex-1 truncate font-medium">{v.title}</span>
				{#if !v.modal && v.spec.minimizable !== false}
					<button class="fw-icon-btn" aria-label="Minimize" onpointerdown={(e) => e.stopPropagation()} onclick={() => (v.minimized = true)}><Icon name="minus" size={13} /></button>
				{/if}
				{#if v.spec.maximizable !== false && v.spec.resizable !== false}
					<button class="fw-icon-btn" aria-label={v.maximized ? "Restore" : "Maximize"} onpointerdown={(e) => e.stopPropagation()} onclick={() => (v.maximized = !v.maximized)}><Icon name={v.maximized ? "copy" : "square"} size={12} /></button>
				{/if}
				<button class="fw-icon-btn hover:bg-destructive hover:text-white" aria-label="Close" onpointerdown={(e) => e.stopPropagation()} onclick={() => w.closeVirtual(v.id)}><Icon name="x" size={14} /></button>
			</header>
			<div class="relative flex min-h-0 flex-1 flex-col">
				{#if v.layoutWindow}
					<LayoutRoot windowId={v.layoutWindow} />
				{:else if v.spec.view}
					<WindowView view={v.spec.view} props={v.props} self={selfFor(v)} />
				{/if}
			</div>
			{#if v.spec.resizable !== false && !v.maximized}
				<div class="absolute right-0 bottom-0 size-3 cursor-se-resize" role="presentation" onpointerdown={(e) => drag(e, v, "resize")}></div>
			{/if}
		</div>
	{/if}
{/each}

{#if minimized.length}
	<nav class="fixed bottom-8 left-1/2 z-[55] flex -translate-x-1/2 gap-1 rounded-lg border border-border bg-popover p-1 shadow-lg" aria-label="Minimized windows">
		{#each minimized as v (v.id)}
			<button class="fw-btn h-7" use:enter={"rise"} onclick={() => w.raise(v.id)}><Icon name="app-window" size={13} />{v.title}</button>
		{/each}
	</nav>
{/if}
