<script lang="ts">
	import type { MenuKindProps } from "../../../menus/menus.svelte";

	/** Read only progress or status row. */
	let { item, props, value }: MenuKindProps<{ label?: string; value?: number }> = $props();
	const v = $derived(typeof value === "number" ? value : (props.value ?? 0));
</script>

<div class="flex flex-col gap-1 px-2 py-1.5" role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={props.label ?? item.label}>
	<div class="flex justify-between text-xs text-muted-foreground"><span>{props.label ?? item.label}</span><span>{Math.round(v * 100)}%</span></div>
	<div class="h-1.5 overflow-hidden rounded bg-muted"><div class="h-full bg-primary transition-all" style:width="{v * 100}%"></div></div>
</div>
