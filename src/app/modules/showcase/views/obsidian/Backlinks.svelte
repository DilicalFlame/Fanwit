<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import { activeNote, linksOf, openNote, vault } from "./obsidian.svelte";

	/** Notes linking to the focused note. */
	const k = getKernel();
	const note = $derived(activeNote(k));
	const links = $derived(note ? Object.keys(vault.notes).filter((p) => p !== note && linksOf(vault.notes[p]).includes(note)) : []);
	const outgoing = $derived(note ? linksOf(vault.notes[note] ?? "") : []);
</script>

<div class="flex h-full w-full flex-col gap-3 overflow-auto p-3 text-[13px]">
	{#if note}
		<section>
			<div class="mb-1 text-xs font-semibold text-muted-foreground">Linked mentions ({links.length})</div>
			{#each links as p (p)}<button class="block w-full truncate rounded px-1.5 py-1 text-left hover:bg-accent" onclick={() => openNote(k, p)}>{p.replace(/\.md$/, "")}</button>{:else}<p class="text-xs text-muted-foreground">None.</p>{/each}
		</section>
		<section>
			<div class="mb-1 text-xs font-semibold text-muted-foreground">Outgoing links ({outgoing.length})</div>
			{#each outgoing as p (p)}<button class="block w-full truncate rounded px-1.5 py-1 text-left hover:bg-accent" onclick={() => openNote(k, p)}>{p.replace(/\.md$/, "")}</button>{/each}
		</section>
	{:else}
		<p class="text-xs text-muted-foreground">Open a note.</p>
	{/if}
</div>
