<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import { openNote, vault } from "./obsidian.svelte";

	/** Full text search across the mock vault. */
	const k = getKernel();
	let q = $state("");
	const hits = $derived(
		q.trim()
			? Object.entries(vault.notes).flatMap(([path, text]) => {
					const i = text.toLowerCase().indexOf(q.toLowerCase());
					return i < 0 ? [] : [{ path, before: text.slice(Math.max(0, i - 30), i), match: text.slice(i, i + q.length), after: text.slice(i + q.length, i + q.length + 40) }];
				})
			: []
	);
</script>

<div class="flex h-full w-full flex-col gap-2 p-2 text-[13px]">
	<input class="fw-input" placeholder="Search notes" bind:value={q} aria-label="Search notes" />
	<div class="min-h-0 flex-1 overflow-auto">
		{#each hits as h (h.path)}
			<button class="mb-1 w-full rounded p-1.5 text-left hover:bg-accent" onclick={() => openNote(k, h.path)}>
				<div class="font-medium">{h.path.replace(/\.md$/, "")}</div>
				<div class="truncate text-xs text-muted-foreground">{h.before}<mark class="bg-yellow-300/60 text-inherit">{h.match}</mark>{h.after}</div>
			</button>
		{:else}
			{#if q.trim()}<p class="text-xs text-muted-foreground">No matches.</p>{/if}
		{/each}
	</div>
</div>
