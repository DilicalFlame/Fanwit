<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import { openNote, vault } from "./obsidian.svelte";

	const k = getKernel();
</script>

<div class="flex h-full w-full flex-col p-1 text-[13px]">
	{#each vault.bookmarks as path (path)}
		<button class="flex h-7 items-center gap-2 rounded px-2 text-left hover:bg-accent" onclick={() => openNote(k, path)}><Icon name="bookmark" size={13} class="opacity-60" />{path.replace(/\.md$/, "")}</button>
	{:else}
		<p class="p-2 text-xs text-muted-foreground">Bookmark a note with the bookmark icon in its tab.</p>
	{/each}
</div>
