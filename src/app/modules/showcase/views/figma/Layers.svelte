<script lang="ts">
	import Icon from "$fanwit/icons/Icon.svelte";
	import { figma } from "./figma.svelte";

	/** Layer list, topmost first: select, rename (double click), hide. */
	const ICONS = { frame: "frame", rect: "square", ellipse: "circle", text: "type" } as const;
	let renaming = $state<string | null>(null);
	const ordered = $derived([...figma.shapes].reverse());
</script>

<div class="flex h-full w-full flex-col overflow-auto py-1 text-xs">
	<div class="px-3 pt-1 pb-2 text-[11px] font-semibold text-muted-foreground">Page 1</div>
	{#each ordered as s (s.id)}
		<div class="group flex h-7 items-center gap-2 px-3 {figma.selected === s.id ? 'bg-[#0d99ff]/15' : 'hover:bg-accent'}">
			<Icon name={ICONS[s.type]} size={13} class="opacity-60" />
			{#if renaming === s.id}
				<!-- svelte-ignore a11y_autofocus -->
				<input class="fw-input h-5 flex-1 px-1 text-xs" autofocus bind:value={s.name} onblur={() => (renaming = null)} onkeydown={(e) => e.key === "Enter" && (renaming = null)} />
			{:else}
				<button class="flex-1 truncate text-left {s.hidden ? 'opacity-40' : ''}" onclick={() => (figma.selected = s.id)} ondblclick={() => (renaming = s.id)}>{s.name}</button>
			{/if}
			<button class="opacity-0 group-hover:opacity-70 focus-visible:opacity-100 {s.hidden ? 'opacity-70' : ''}" aria-label={s.hidden ? `Show ${s.name}` : `Hide ${s.name}`} onclick={() => (s.hidden = !s.hidden || undefined)}>
				<Icon name={s.hidden ? "eye-off" : "eye"} size={13} />
			</button>
		</div>
	{/each}
</div>
