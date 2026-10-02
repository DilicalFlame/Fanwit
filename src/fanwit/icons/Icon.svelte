<script lang="ts">
	import type { Component } from "svelte";
	import { icons } from "./registry.svelte";

	let { name, size = 16, class: cls = "", strokeWidth = 1.75 }: { name?: string; size?: number; class?: string; strokeWidth?: number } = $props();

	let comp = $state<Component | null>(null);
	const svg = $derived(name ? (void icons.version, icons.svg(name)) : undefined);

	$effect(() => {
		const n = name;
		if (!n || svg) {
			comp = null;
			return;
		}
		comp = icons.cached(n) ?? null;
		if (!comp) icons.load(n).then((c) => n === name && (comp = c));
	});
</script>

{#if svg}
	<span class="inline-flex shrink-0 {cls}" style:width="{size}px" style:height="{size}px" aria-hidden="true">{@html svg}</span>
{:else if comp}
	{@const C = comp}
	<C {size} {strokeWidth} class="shrink-0 {cls}" aria-hidden="true" />
{:else}
	<span class="inline-block shrink-0 {cls}" style:width="{size}px" style:height="{size}px" aria-hidden="true"></span>
{/if}
