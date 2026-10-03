<script lang="ts">
	import { onDestroy } from "svelte";
	import { getKernel } from "$fanwit/ui.svelte";
	import EmptyState from "$fanwit/workbench/EmptyState.svelte";

	/** Notes linking to the active note, from the notes.links indexer (SQL over the vault index). */
	const k = getKernel();
	const { layout, vault } = k.sys;
	const path = $derived(layout.activeDocument ? (layout.doc.pane[layout.activeDocument]?.props?.path as string | undefined) : undefined);
	let rows = $state<{ path: string }[]>([]);
	let tick = $state(0);
	const d = k.events.on("vault:indexed" as never, () => tick++);
	onDestroy(() => d.dispose());
	$effect(() => {
		void tick;
		const p = path;
		if (!p || !vault.current) return void (rows = []);
		void vault.index.query("notes.links", "$.links", p).then((r) => (rows = r.filter((x) => x.path !== p)));
	});
</script>

{#if !k.host.caps.sql}
	<EmptyState icon="link" title="Backlinks need SQL" description="This host has no SQL engine." />
{:else if !path}
	<EmptyState icon="link" title="No note selected" description="Backlinks of the active note appear here." />
{:else if !rows.length}
	<EmptyState icon="link" title="No backlinks" description={`No note links to ${path.split("/").pop()} yet. Link with [[${path.replace(/\.md$/, "")}]].`} />
{:else}
	<ul class="p-1 text-[13px]">
		{#each rows as r (r.path)}
			<li><button class="w-full truncate rounded px-2 py-1 text-left hover:bg-accent" onclick={() => layout.openView("notes.editor", { path: r.path })}>{r.path}</button></li>
		{/each}
	</ul>
{/if}
