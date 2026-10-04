<script lang="ts">
	import { addShape, figma, removeSelected, type Shape, type Tool } from "./figma.svelte";

	/**
	 * Infinite canvas: wheel pans, Ctrl+wheel zooms at the pointer, the hand tool (or the middle
	 * button) drags the view, shape tools draw by dragging, the move tool selects and drags.
	 * Keys: V F R O T H pick tools, Delete removes, Escape deselects.
	 */
	let el = $state<HTMLDivElement>();
	let editing = $state<string | null>(null);
	const KEYS: Record<string, Tool> = { v: "move", f: "frame", r: "rect", o: "ellipse", t: "text", h: "hand" };

	const world = (e: { clientX: number; clientY: number }) => {
		const r = el!.getBoundingClientRect();
		return { x: (e.clientX - r.left - figma.pan.x) / figma.zoom, y: (e.clientY - r.top - figma.pan.y) / figma.zoom };
	};

	function drag(e: PointerEvent, onMove: (ev: PointerEvent) => void, onUp?: () => void) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		const target = e.currentTarget as HTMLElement;
		const up = () => {
			target.removeEventListener("pointermove", onMove);
			target.removeEventListener("pointerup", up);
			onUp?.();
		};
		target.addEventListener("pointermove", onMove);
		target.addEventListener("pointerup", up);
	}

	function down(e: PointerEvent) {
		el?.focus();
		const start = world(e);
		if (figma.tool === "hand" || e.button === 1) {
			const p0 = { ...figma.pan };
			drag(e, (ev) => (figma.pan = { x: p0.x + ev.clientX - e.clientX, y: p0.y + ev.clientY - e.clientY }));
			return;
		}
		if (e.button !== 0) return;
		if (figma.tool === "move") {
			const id = (e.target as HTMLElement).closest<HTMLElement>("[data-shape]")?.dataset.shape ?? null;
			figma.selected = id;
			const s = figma.shapes.find((x) => x.id === id);
			if (!s) return;
			const o = { x: s.x, y: s.y };
			drag(e, (ev) => {
				const p = world(ev);
				s.x = Math.round(o.x + p.x - start.x);
				s.y = Math.round(o.y + p.y - start.y);
			});
			return;
		}
		const s = addShape(figma.tool as Shape["type"], Math.round(start.x), Math.round(start.y), 1, 1);
		drag(
			e,
			(ev) => {
				const p = world(ev);
				s.x = Math.round(Math.min(start.x, p.x));
				s.y = Math.round(Math.min(start.y, p.y));
				s.w = Math.round(Math.abs(p.x - start.x));
				s.h = Math.round(Math.abs(p.y - start.y));
			},
			() => {
				if (s.w < 4 || s.h < 4) Object.assign(s, s.type === "text" ? { w: 120, h: 28 } : { w: 120, h: 90 });
				figma.tool = "move";
				if (s.type === "text") editing = s.id;
			}
		);
	}

	function resize(e: PointerEvent, s: Shape) {
		e.stopPropagation();
		const start = world(e);
		const o = { w: s.w, h: s.h };
		drag(e, (ev) => {
			const p = world(ev);
			s.w = Math.max(8, Math.round(o.w + p.x - start.x));
			s.h = Math.max(8, Math.round(o.h + p.y - start.y));
		});
	}

	function wheel(e: WheelEvent) {
		e.preventDefault();
		if (e.ctrlKey || e.metaKey) {
			const r = el!.getBoundingClientRect();
			const mx = e.clientX - r.left;
			const my = e.clientY - r.top;
			const z = Math.min(8, Math.max(0.1, figma.zoom * Math.exp(-e.deltaY * 0.002)));
			figma.pan = { x: mx - ((mx - figma.pan.x) * z) / figma.zoom, y: my - ((my - figma.pan.y) * z) / figma.zoom };
			figma.zoom = z;
		} else figma.pan = { x: figma.pan.x - e.deltaX, y: figma.pan.y - e.deltaY };
	}

	function keys(e: KeyboardEvent) {
		if (editing || e.ctrlKey || e.metaKey || e.altKey) return;
		const tool = KEYS[e.key.toLowerCase()];
		if (tool) figma.tool = tool;
		else if (e.key === "Delete" || e.key === "Backspace") removeSelected();
		else if (e.key === "Escape") figma.selected = null;
		else return;
		e.preventDefault();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (a drawing surface: keys pick tools, the pointer draws) -->
<div
	bind:this={el}
	role="application"
	aria-label="Design canvas"
	tabindex="0"
	class="relative h-full w-full overflow-hidden bg-[#e5e5e5] outline-none dark:bg-[#1e1e1e] {figma.tool === 'hand' ? 'cursor-grab' : figma.tool === 'move' ? 'cursor-default' : 'cursor-crosshair'}"
	style:background-image="radial-gradient(circle, rgb(128 128 128 / 0.35) 1px, transparent 1px)"
	style:background-size="{20 * figma.zoom}px {20 * figma.zoom}px"
	style:background-position="{figma.pan.x}px {figma.pan.y}px"
	onpointerdown={down}
	onwheel={wheel}
	onkeydown={keys}
>
	<div class="absolute top-0 left-0 origin-top-left" style:transform="translate({figma.pan.x}px, {figma.pan.y}px) scale({figma.zoom})">
		{#each figma.shapes as s (s.id)}
			{#if !s.hidden}
				<div
					data-shape={s.id}
					class="absolute {s.type === 'text' ? 'flex items-center' : ''} {figma.selected === s.id ? 'outline-2 outline-[#0d99ff]' : figma.tool === 'move' ? 'hover:outline hover:outline-[#0d99ff]' : ''}"
					style:left="{s.x}px"
					style:top="{s.y}px"
					style:width="{s.w}px"
					style:height="{s.h}px"
					style:background={s.type === "text" ? "transparent" : s.fill}
					style:color={s.type === "text" ? s.fill : undefined}
					style:border-radius={s.type === "ellipse" ? "50%" : `${s.radius}px`}
					style:opacity={s.opacity / 100}
					style:box-shadow={s.type === "frame" ? "0 1px 3px rgb(0 0 0 / 0.15)" : undefined}
					ondblclick={() => s.type === "text" && (editing = s.id)}
					role="presentation"
				>
					{#if s.type === "frame"}<span class="absolute -top-5 left-0 text-[11px] whitespace-nowrap text-neutral-500">{s.name}</span>{/if}
					{#if s.type === "text"}
						{#if editing === s.id}
							<!-- svelte-ignore a11y_autofocus -->
							<input class="w-full bg-transparent text-lg font-semibold outline-none" autofocus bind:value={s.text} onpointerdown={(e) => e.stopPropagation()} onblur={() => (editing = null)} onkeydown={(e) => e.key === "Enter" && (editing = null)} />
						{:else}<span class="truncate text-lg font-semibold">{s.text}</span>{/if}
					{/if}
					{#if figma.selected === s.id}
						<div class="absolute -right-1 -bottom-1 size-2 cursor-se-resize border border-[#0d99ff] bg-white" role="presentation" onpointerdown={(e) => resize(e, s)}></div>
					{/if}
				</div>
			{/if}
		{/each}
	</div>
</div>
