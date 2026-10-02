<script lang="ts">
	import type { MenuKindProps } from "../../../menus/menus.svelte";
	import Icon from "../../../icons/Icon.svelte";

	/** Minus, value, plus (font size, stroke width); runs the command with { value }. */
	let { item, props, value, emit }: MenuKindProps<{ label?: string; min?: number; max?: number; step?: number; unit?: string }> = $props();
	const v = $derived(typeof value === "number" ? value : Number(props.min ?? 0));
	const step = $derived(props.step ?? 1);
	const set = (n: number) => emit({ value: Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, n)) }, { keepOpen: true });
</script>

<div class="flex items-center gap-2 px-2 py-1" data-menu-composite>
	<span class="flex-1 truncate text-sm">{props.label ?? item.label}</span>
	<div role="group" aria-label={props.label ?? item.label} class="flex items-center rounded-md border border-border">
		<button class="fw-icon-btn size-6" aria-label="Decrease" disabled={!item.enabled} onclick={() => set(v - step)}><Icon name="minus" size={13} /></button>
		<span class="min-w-12 text-center text-xs tabular-nums" aria-live="polite">{v}{props.unit ?? ""}</span>
		<button class="fw-icon-btn size-6" aria-label="Increase" disabled={!item.enabled} onclick={() => set(v + step)}><Icon name="plus" size={13} /></button>
	</div>
</div>
