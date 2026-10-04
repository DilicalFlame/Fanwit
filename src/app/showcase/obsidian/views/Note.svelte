<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import { render } from "$fanwit/manual/markdown";
	import { LINK, openNote, vault } from "./obsidian.svelte";

	/** A note: reading view with clickable [[links]] (Ctrl+click opens beside), or the editor. */
	let { props }: { props: { note?: string } } = $props();
	const k = getKernel();
	const note = $derived(props.note ?? "Welcome.md");
	let editing = $state(false);
	const missing = $derived(vault.notes[note] === undefined);
	const html = $derived(render((vault.notes[note] ?? "").replace(LINK, (_, name: string) => `[${name.trim().split("/").pop()}](#note:${encodeURIComponent(name.trim())})`)).html);
	const marked = $derived(vault.bookmarks.includes(note));

	function click(e: MouseEvent) {
		const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#note:"]');
		if (!a) return;
		e.preventDefault();
		const name = decodeURIComponent(a.getAttribute("href")!.slice(6));
		const path = name.endsWith(".md") ? name : `${name}.md`;
		vault.notes[path] ??= `# ${name.split("/").pop()}\n\n`;
		void openNote(k, path, e.ctrlKey || e.metaKey);
	}
</script>

<div class="flex h-full w-full flex-col">
	<div class="flex h-8 shrink-0 items-center gap-1 px-3 text-xs text-muted-foreground">
		<span class="truncate">{note.replace(/\.md$/, "").replaceAll("/", " / ")}</span>
		<div class="ml-auto flex">
			<button class="fw-icon-btn" aria-pressed={marked} title={marked ? "Remove bookmark" : "Bookmark"} aria-label="Bookmark" onclick={() => (vault.bookmarks = marked ? vault.bookmarks.filter((b) => b !== note) : [...vault.bookmarks, note])}><Icon name={marked ? "bookmark-check" : "bookmark"} size={14} /></button>
			<button class="fw-icon-btn" title={editing ? "Reading view" : "Edit"} aria-label={editing ? "Reading view" : "Edit"} onclick={() => (editing = !editing)}><Icon name={editing ? "book-open" : "pencil"} size={14} /></button>
		</div>
	</div>
	{#if missing}
		<p class="p-6 text-sm text-muted-foreground">This note was deleted.</p>
	{:else if editing}
		<textarea class="min-h-0 flex-1 resize-none bg-transparent px-10 py-4 font-mono text-[13px] leading-relaxed outline-none" bind:value={vault.notes[note]} aria-label="Note text"></textarea>
	{:else}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (clicks only route to the links inside, which are keyboard reachable) -->
		<article class="fw-prose selectable min-h-0 flex-1 overflow-auto px-10 py-4" onclick={click}>{@html html}</article>
	{/if}
</div>

<style>
	/* internal [[links]] look like Obsidian's */
	article :global(a[href^="#note:"]) {
		color: var(--color-violet-500);
		text-decoration: none;
	}
</style>
