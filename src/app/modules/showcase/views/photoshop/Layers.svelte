<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import { activeDoc, addLayer } from "./ps.svelte";

	/** Layers of the active document, topmost first. */
	const k = getKernel();
	const cur = $derived(activeDoc(k));
	const doc = $derived(cur?.doc);
	const active = $derived(doc?.layers.find((l) => l.id === doc.active));
</script>

<div class="flex h-full w-full flex-col bg-[#323232] text-xs text-[#ddd]">
	{#if doc}
		{#if active}
			<label class="flex items-center gap-2 border-b border-black/40 px-3 py-1.5">Opacity <input type="range" min="0" max="100" bind:value={active.opacity} class="flex-1" /><span class="w-8 text-right font-mono">{active.opacity}%</span></label>
		{/if}
		<div class="min-h-0 flex-1 overflow-auto">
			{#each [...doc.layers].reverse() as l (l.id)}
				<div class="flex h-9 items-center gap-2 border-b border-black/30 px-2 {doc.active === l.id ? 'bg-[#1473e6]/40' : 'hover:bg-white/5'}">
					<button aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`} class="opacity-80" onclick={() => (l.visible = !l.visible)}><Icon name={l.visible ? "eye" : "eye-off"} size={14} /></button>
					<span class="h-6 w-8 rounded-sm border border-black/40" style:background="repeating-conic-gradient(#bbb 0 25%, #fff 0 50%) 0 0 / 6px 6px"></span>
					<button class="flex-1 truncate text-left" onclick={() => (doc.active = l.id)}>{l.name}</button>
				</div>
			{/each}
		</div>
		<div class="flex justify-end gap-1 border-t border-black/40 p-1">
			<button class="rounded p-1 hover:bg-white/10" title="New layer" aria-label="New layer" onclick={() => addLayer(doc)}><Icon name="file-plus" size={14} /></button>
			<button
				class="rounded p-1 hover:bg-white/10 disabled:opacity-40"
				title="Delete layer"
				aria-label="Delete layer"
				disabled={doc.layers.length < 2}
				onclick={() => {
					doc.layers = doc.layers.filter((l) => l.id !== doc.active);
					doc.active = doc.layers.at(-1)!.id;
					doc.history.push("Delete Layer");
				}}><Icon name="trash-2" size={14} /></button
			>
		</div>
	{:else}
		<p class="p-3 opacity-60">Open a document.</p>
	{/if}
</div>
