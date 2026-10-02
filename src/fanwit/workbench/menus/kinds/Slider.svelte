<script lang="ts">
	import type { MenuKindProps } from "../../../menus/menus.svelte";

	/** Label and slider with live value; preview command while dragging, commit on release. */
	let { item, props, value, emit }: MenuKindProps<{ label?: string; min?: number; max?: number; step?: number; unit?: string }> = $props();
	let current = $state<number>(0);
	$effect(() => {
		current = typeof value === "number" ? value : Number(props.min ?? 0);
	});
	let last = 0;
	function preview() {
		const now = performance.now();
		if (now - last < 50) return; // throttled
		last = now;
		emit({ value: current }, { preview: true, keepOpen: true });
	}
</script>

<label class="flex flex-col gap-1 px-2 py-1.5" data-menu-composite>
	<span class="flex items-center justify-between text-sm"><span>{props.label ?? item.label}</span><span class="text-xs text-muted-foreground tabular-nums">{current}{props.unit ?? ""}</span></span>
	<input
		type="range"
		class="w-full accent-[var(--primary)]"
		min={props.min ?? 0}
		max={props.max ?? 100}
		step={props.step ?? 1}
		disabled={!item.enabled}
		bind:value={current}
		oninput={preview}
		onchange={() => emit({ value: current }, { keepOpen: true })}
		onkeydown={(e) => (e.key === "ArrowLeft" || e.key === "ArrowRight") && e.stopPropagation()}
	/>
</label>
