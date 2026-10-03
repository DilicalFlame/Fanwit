<script lang="ts">
	import type { Snippet } from "svelte";
	import Icon from "../icons/Icon.svelte";
	import { enter } from "../motion/motion";

	let { icon = "inbox", title, description, children }: { icon?: string; title: string; description?: string; children?: Snippet } = $props();
</script>

<div use:enter={{ preset: "rise", stagger: "> *" }} class="flex h-full min-h-32 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
	<Icon name={icon} size={28} class="opacity-60" />
	<div class="text-sm font-medium text-foreground/80">{title}</div>
	{#if description}<div class="max-w-72 text-xs">{description}</div>{/if}
	{#if children}<div class="mt-2 flex flex-wrap justify-center gap-2">{@render children()}</div>{/if}
</div>
