<script lang="ts">
	import type { MenuKindProps } from "../../../menus/menus.svelte";
	import Icon from "../../../icons/Icon.svelte";

	/** Segmented control (align left, centre, right); runs the command with { value }. */
	let { item, props, value, emit }: MenuKindProps<{ label?: string; options?: { value: string; label?: string; icon?: string }[] }> = $props();
	const options = $derived(props.options ?? []);

	function keys(e: KeyboardEvent) {
		if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
		e.preventDefault();
		e.stopPropagation();
		const i = options.findIndex((o) => o.value === value);
		const next = options[(i + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length];
		if (next) emit({ value: next.value }, { keepOpen: true });
	}
</script>

<div class="flex items-center gap-2 px-2 py-1" data-menu-composite>
	<span class="flex-1 truncate text-sm">{props.label ?? item.label}</span>
	<div role="radiogroup" tabindex="0" aria-label={props.label ?? item.label} class="flex rounded-md border border-border p-0.5" onkeydown={keys}>
		{#each options as o (o.value)}
			<button
				role="radio"
				aria-checked={o.value === value}
				tabindex="-1"
				disabled={!item.enabled}
				class="flex h-6 items-center gap-1 rounded px-2 text-xs {o.value === value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}"
				onclick={() => emit({ value: o.value }, { keepOpen: true })}
			>
				{#if o.icon}<Icon name={o.icon} size={13} />{/if}{o.label ?? o.value}
			</button>
		{/each}
	</div>
</div>
