<script lang="ts">
	/**
	 * 1 px line with a 6 px hit area, pointer capture while dragging, keyboard resizing
	 * (arrows 10 px, Shift 50 px), double click to equalise, ARIA separator with value.
	 */
	let {
		dir,
		onresize,
		onend,
		onequalize,
		value = 50,
		label = "Resize"
	}: { dir: "row" | "column"; onresize: (delta: number) => void; onend?: () => void; onequalize?: () => void; value?: number; label?: string } = $props();

	let dragging = $state(false);
	let last = 0;

	function down(e: PointerEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		dragging = true;
		last = dir === "row" ? e.clientX : e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (!dragging) return;
		const p = dir === "row" ? e.clientX : e.clientY;
		const d = p - last;
		if (d) {
			last = p;
			onresize(d);
		}
	}
	function up() {
		if (!dragging) return;
		dragging = false;
		onend?.();
	}
	function key(e: KeyboardEvent) {
		const step = e.shiftKey ? 50 : 10;
		const fwd = dir === "row" ? "ArrowRight" : "ArrowDown";
		const back = dir === "row" ? "ArrowLeft" : "ArrowUp";
		if (e.key === fwd || e.key === back) {
			e.preventDefault();
			onresize(e.key === fwd ? step : -step);
			onend?.();
		} else if (e.key === "Enter" && onequalize) {
			e.preventDefault();
			onequalize();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (a focusable separator is the ARIA window splitter widget: arrow keys resize, Enter equalizes) -->
<div
	role="separator"
	aria-orientation={dir === "row" ? "vertical" : "horizontal"}
	aria-label={label}
	aria-valuenow={Math.round(value)}
	aria-valuemin={0}
	aria-valuemax={100}
	tabindex="0"
	class="group relative z-10 shrink-0 outline-none {dir === 'row' ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize'}"
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
	ondblclick={() => onequalize?.()}
	onkeydown={key}
>
	<div
		class="absolute transition-colors group-hover:bg-splitter-hover group-focus-visible:bg-splitter-hover {dragging ? 'bg-splitter-hover' : 'bg-splitter'} {dir === 'row'
			? 'inset-y-0 left-0 w-px'
			: 'inset-x-0 top-0 h-px'}"
	></div>
	<div class="absolute {dir === 'row' ? 'inset-y-0 -left-[3px] w-[7px]' : 'inset-x-0 -top-[3px] h-[7px]'}"></div>
</div>
