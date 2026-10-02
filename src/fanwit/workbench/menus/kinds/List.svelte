<script lang="ts">
	import type { MenuKindProps } from "../../../menus/menus.svelte";
	import Icon from "../../../icons/Icon.svelte";

	/** Dynamic list from props.items (filled by a provider), with a search box for long lists. */
	let { item, props, emit }: MenuKindProps<{ label?: string; items?: { label: string; icon?: string; command: string; args?: Record<string, unknown> }[]; searchable?: boolean }> = $props();
	let q = $state("");
	const rows = $derived((props.items ?? []).filter((r) => !q || r.label.toLowerCase().includes(q.toLowerCase())));
</script>

<div class="flex flex-col" data-menu-composite>
	{#if props.searchable || (props.items?.length ?? 0) > 8}
		<input class="fw-input mx-2 my-1 h-7 w-auto text-xs" placeholder="Filter…" bind:value={q} onkeydown={(e) => e.stopPropagation()} aria-label="Filter {props.label ?? item.label}" />
	{/if}
	{#each rows as r, i (i)}
		<button class="fw-menu-row" onclick={() => emit({ __command: r.command, ...(r.args ?? {}) })}>
			{#if r.icon}<Icon name={r.icon} size={15} />{:else}<span class="w-[15px]"></span>{/if}
			<span class="truncate">{r.label}</span>
		</button>
	{:else}
		<div class="px-2 py-1 text-xs text-muted-foreground">Nothing here</div>
	{/each}
</div>
