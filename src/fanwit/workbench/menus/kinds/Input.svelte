<script lang="ts">
	import type { MenuKindProps } from "../../../menus/menus.svelte";

	/** Inline text field (rename, quick filter, new tag); runs the command with { text } on Enter. */
	let { item, props, value, emit, close }: MenuKindProps<{ label?: string; placeholder?: string }> = $props();
	let text = $state("");
	$effect(() => {
		text = typeof value === "string" ? value : "";
	});
</script>

<div class="px-2 py-1" data-menu-composite>
	<input
		class="fw-input h-7 text-xs"
		placeholder={props.placeholder ?? props.label ?? item.label}
		aria-label={props.label ?? item.label}
		disabled={!item.enabled}
		bind:value={text}
		onkeydown={(e) => {
			e.stopPropagation();
			if (e.key === "Enter" && text.trim()) emit({ text: text.trim() });
			if (e.key === "Escape") close();
		}}
	/>
</div>
