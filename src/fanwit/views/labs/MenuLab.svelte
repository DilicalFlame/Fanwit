<script lang="ts">
	import { getKernel, menu } from "../../ui.svelte";
	import { ctxkeys } from "../../kernel/context.svelte";
	import { canvas } from "./canvas.svelte";

	/**
	 * Menu Lab: right click selected shapes for the canvas/selection menu, which mixes built in
	 * and custom item kinds (icon row, colour swatches, slider with live preview, submenu, danger
	 * group). Every effect is an undoable command. In developer mode, Edit this menu.
	 */
	const k = getKernel();
	const sel = $derived(canvas.shapes.filter((s) => canvas.selected.includes(s.id)));
	function pick(e: PointerEvent, id: string | null) {
		if (!id) {
			if (e.button === 0) canvas.selected = [];
			return;
		}
		// right click selects the item under the pointer first, unless it is already selected
		if (e.button === 2 && canvas.selected.includes(id)) return;
		canvas.selected = e.shiftKey ? [...new Set([...canvas.selected, id])] : [id];
	}
	function drag(e: PointerEvent, id: string) {
		if (e.button !== 0) return;
		const s = canvas.shapes.find((x) => x.id === id)!;
		if (s.locked) return;
		const sx = e.clientX - s.x;
		const sy = e.clientY - s.y;
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture(e.pointerId);
		const move = (ev: PointerEvent) => ((s.x = ev.clientX - sx), (s.y = ev.clientY - sy));
		const up = () => (el.removeEventListener("pointermove", move), el.removeEventListener("pointerup", up));
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerup", up);
	}
</script>

<div class="flex h-full flex-col">
	<div class="border-b border-border px-3 py-2 text-xs text-muted-foreground">
		Click a shape (Shift for more), then right click it. Try the swatches, the opacity slider (live preview) and Arrange. <b>{sel.length}</b> selected.
		{#if !k.context.get("devMode")}<button class="ml-2 underline" onclick={() => k.commands.run("dev.toggleMode")}>Enable developer mode</button> to edit the menu.{/if}
	</div>
	<div
		role="application"
		aria-label="Canvas"
		class="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:16px_16px]"
		onpointerdown={(e) => e.target === e.currentTarget && pick(e, null)}
		use:menu={{ location: "canvas/empty", target: {} }}
	>
		{#each canvas.shapes as s (s.id)}
			<div
				role="button"
				tabindex="0"
				aria-label="Shape {s.id}"
				aria-pressed={canvas.selected.includes(s.id)}
				data-fw-id="canvas-shape"
				class="absolute {s.round ? 'rounded-full' : 'rounded-md'} {canvas.selected.includes(s.id) ? 'outline-2 outline-offset-2 outline-sky-500' : ''} {s.locked ? 'cursor-not-allowed' : 'cursor-move'}"
				style:left="{s.x}px"
				style:top="{s.y}px"
				style:width="{s.w}px"
				style:height="{s.h}px"
				style:background={s.fill}
				style:opacity={(canvas.preview[s.id] ?? s.opacity) / 100}
				onpointerdown={(e) => {
					pick(e, s.id);
					drag(e, s.id);
				}}
				onkeydown={(e) => e.key === "Delete" && k.commands.run("canvas.delete", { ids: canvas.selected })}
				use:menu={{ location: "canvas/selection", target: { ids: canvas.selected.includes(s.id) ? canvas.selected : [s.id], opacity: s.opacity, fill: s.fill } }}
				use:ctxkeys={{ "selection.count": canvas.selected.length, "selection.locked": s.locked, "selection.kind": "shape" }}
			></div>
		{/each}
	</div>
</div>
