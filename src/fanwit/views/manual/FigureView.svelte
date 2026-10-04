<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import { animateFigure, animated, type FigureAnimation } from "../../manual/figure-anim";

	/**
	 * A diagram from a manual page, large, in a lightbox overlay (`manual.figure`): wheel or pinch
	 * to zoom where the pointer is, drag to move, double click to zoom in there. Keys: + and - zoom,
	 * 0 fits, 1 is actual size, arrows move, Escape closes.
	 */
	let { paneId, props }: { paneId: string; props: { figure?: string } } = $props();
	const k = getKernel();
	const layout = k.sys.layout;
	let stage = $state<HTMLDivElement>();
	let content = $state<HTMLDivElement>();
	let scale = $state(1);
	let x = $state(0);
	let y = $state(0);
	let caption = $state("");
	let size = { w: 1, h: 1 };
	let anim: FigureAnimation | null = null;
	let canReplay = $state(false);
	const MIN = 0.2;
	const MAX = 12;

	function close() {
		const id = Object.entries(layout.doc.overlay ?? {}).find(([, o]) => o.pane === paneId)?.[0];
		if (id) void layout.dispatch({ type: "closeOverlay", overlay: id });
	}

	$effect(() => {
		if (!content) return;
		// the figure is on the page behind this overlay; reopened from a saved layout, it may not be
		const source = document.querySelector<HTMLElement>(`[data-figure="${CSS.escape(props.figure ?? "")}"]`);
		const svg = source?.querySelector("svg");
		if (!svg) return void close();
		caption = source?.querySelector("figcaption")?.textContent ?? "";
		const clone = svg.cloneNode(true) as SVGSVGElement;
		for (const el of clone.querySelectorAll("[data-fw-anim]")) el.remove();
		const [, , w, h] = (clone.getAttribute("viewBox") ?? "0 0 100 100").split(/\s+/).map(Number);
		// viewBox units are points; draw it at its natural size in pixels, then zoom
		size = { w: w * 1.333, h: h * 1.333 };
		clone.setAttribute("width", String(size.w));
		clone.setAttribute("height", String(size.h));
		clone.removeAttribute("style");
		content.replaceChildren(clone);
		fit();
		stage?.focus({ preventScroll: true });
		anim = animateFigure(clone);
		canReplay = !!anim && animated(clone);
		return () => anim?.kill();
	});

	function fit() {
		if (!stage) return;
		// computed from locals: fit runs inside the setup effect, which must not depend on scale
		const s = Math.min(Math.max(Math.min(stage.clientWidth / size.w, stage.clientHeight / size.h) * 0.92, MIN), MAX);
		scale = s;
		x = (stage.clientWidth - size.w * s) / 2;
		y = (stage.clientHeight - size.h * s) / 2;
	}
	/** Zoom to `next`, keeping the point (px, py) of the stage where it is. */
	function zoomAt(next: number, px = (stage?.clientWidth ?? 0) / 2, py = (stage?.clientHeight ?? 0) / 2) {
		const s = Math.min(Math.max(next, MIN), MAX);
		x = px - ((px - x) * s) / scale;
		y = py - ((py - y) * s) / scale;
		scale = s;
	}
	const local = (e: { clientX: number; clientY: number }) => {
		const r = stage!.getBoundingClientRect();
		return [e.clientX - r.left, e.clientY - r.top] as const;
	};

	function wheel(e: WheelEvent) {
		e.preventDefault();
		zoomAt(scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), ...local(e));
	}

	// one pointer pans; two pinch
	const pointers = new Map<number, { x: number; y: number }>();
	let pinch: { d: number; scale: number } | null = null;
	function down(e: PointerEvent) {
		stage?.setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale };
		}
	}
	function move(e: PointerEvent) {
		const prev = pointers.get(e.pointerId);
		if (!prev) return;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pinch && pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			zoomAt((pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, ...local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }));
		} else {
			x += e.clientX - prev.x;
			y += e.clientY - prev.y;
		}
	}
	function up(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (pointers.size < 2) pinch = null;
	}
	function keys(e: KeyboardEvent) {
		const step = 60;
		const map: Record<string, () => void> = {
			"+": () => zoomAt(scale * 1.25),
			"=": () => zoomAt(scale * 1.25),
			"-": () => zoomAt(scale / 1.25),
			"0": fit,
			"1": () => zoomAt(1),
			ArrowLeft: () => (x += step),
			ArrowRight: () => (x -= step),
			ArrowUp: () => (y += step),
			ArrowDown: () => (y -= step)
		};
		const f = map[e.key];
		if (!f) return;
		e.preventDefault();
		f();
	}
</script>

<div class="fw-figure-view flex size-full min-h-0 flex-col overflow-hidden rounded-lg bg-background">
	<div class="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2 text-xs">
		<Icon name="image" size={14} class="ml-1 text-muted-foreground" />
		<span class="min-w-0 flex-1 truncate px-1 text-muted-foreground">{caption || "Diagram"}</span>
		{#if canReplay}<button class="fw-icon-btn" aria-label="Play the animation again" title="Play again" onclick={() => anim?.replay()}><Icon name="rotate-ccw" size={14} /></button>{/if}
		<button class="fw-icon-btn" aria-label="Zoom out" title="Zoom out (-)" onclick={() => zoomAt(scale / 1.25)}><Icon name="zoom-out" size={14} /></button>
		<button class="w-12 rounded px-1 py-0.5 tabular-nums hover:bg-accent" aria-label="Actual size" title="Actual size (1)" onclick={() => zoomAt(1)}>{Math.round(scale * 100)}%</button>
		<button class="fw-icon-btn" aria-label="Zoom in" title="Zoom in (+)" onclick={() => zoomAt(scale * 1.25)}><Icon name="zoom-in" size={14} /></button>
		<button class="fw-icon-btn" aria-label="Fit to the window" title="Fit (0)" onclick={fit}><Icon name="maximize" size={14} /></button>
		<button class="fw-icon-btn" aria-label="Close" title="Close (Esc)" onclick={close}><Icon name="x" size={15} /></button>
	</div>
	<!-- wheel, drag, pinch and double click are shortcuts: + - 0 1 and the arrow keys do the same, and so do the toolbar buttons -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={stage}
		class="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden outline-none select-none active:cursor-grabbing"
		role="application"
		aria-label="{caption || 'Diagram'}. Plus and minus zoom, arrows move, 0 fits."
		tabindex="0"
		onwheel={wheel}
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
		ondblclick={(e) => zoomAt(scale * 2, ...local(e))}
		onkeydown={keys}
	>
		<div bind:this={content} class="absolute top-0 left-0 origin-top-left" style:transform="translate({x}px, {y}px) scale({scale})"></div>
	</div>
</div>
