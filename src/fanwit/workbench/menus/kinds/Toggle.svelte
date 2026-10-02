<script lang="ts">
	import type { MenuKindProps } from "../../../menus/menus.svelte";
	import Icon from "../../../icons/Icon.svelte";

	/** Row with a switch on the right; runs the command with { on }. */
	let { item, props, value, emit }: MenuKindProps<{ label?: string }> = $props();
	const on = $derived(value === undefined ? item.checked : !!value);
</script>

<button role="menuitemcheckbox" aria-checked={on} disabled={!item.enabled} class="fw-menu-row" onclick={() => emit({ on: !on }, { keepOpen: true })}>
	{#if item.icon}<Icon name={item.icon} size={15} class="opacity-80" />{:else}<span class="w-[15px]"></span>{/if}
	<span class="flex-1 truncate">{props.label ?? item.label}</span>
	<span class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors {on ? 'bg-primary' : 'bg-input'}">
		<span class="absolute size-3 rounded-full bg-background shadow transition-transform {on ? 'translate-x-3.5' : 'translate-x-0.5'}"></span>
	</span>
</button>
