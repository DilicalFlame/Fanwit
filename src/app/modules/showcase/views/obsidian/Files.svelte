<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import { activeNote, openNote, vault } from "./obsidian.svelte";

	/** Folder tree of the mock vault. Click opens; Ctrl+click opens beside; New note creates one. */
	const k = getKernel();
	let closed = $state<Record<string, boolean>>({});
	const tree = $derived.by(() => {
		const folders = new Map<string, string[]>();
		for (const path of Object.keys(vault.notes).sort()) {
			const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
			folders.set(dir, [...(folders.get(dir) ?? []), path]);
		}
		return [...folders.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
	});
	const active = $derived(activeNote(k));

	function create() {
		let n = 1;
		while (vault.notes[`Untitled ${n}.md`] !== undefined) n++;
		vault.notes[`Untitled ${n}.md`] = "# Untitled\n\n";
		void openNote(k, `Untitled ${n}.md`);
	}
</script>

<div class="flex h-full w-full flex-col text-[13px]">
	<div class="flex justify-center gap-1 border-b border-border p-1">
		<button class="fw-icon-btn" title="New note" aria-label="New note" onclick={create}><Icon name="square-pen" size={15} /></button>
	</div>
	<div class="min-h-0 flex-1 overflow-auto py-1">
		{#each tree as [dir, notes] (dir)}
			{#if dir}
				<button class="flex h-6 w-full items-center gap-1 px-2 text-left hover:bg-accent" onclick={() => (closed[dir] = !closed[dir])}>
					<Icon name="chevron-right" size={12} class="opacity-60 transition-transform {closed[dir] ? '' : 'rotate-90'}" />{dir}
				</button>
			{/if}
			{#if !closed[dir]}
				{#each notes as path (path)}
					<button class="flex h-6 w-full items-center truncate rounded-sm text-left {active === path ? 'bg-accent font-medium' : 'hover:bg-accent/60'}" style:padding-left="{dir ? 26 : 10}px" onclick={(e) => openNote(k, path, e.ctrlKey || e.metaKey)}>
						{path.split("/").pop()!.replace(/\.md$/, "")}
					</button>
				{/each}
			{/if}
		{/each}
	</div>
</div>
