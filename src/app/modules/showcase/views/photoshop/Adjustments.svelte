<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import { activeDoc } from "./ps.svelte";

	/** Non destructive adjustments on the active document (live CSS filters). */
	const k = getKernel();
	const doc = $derived(activeDoc(k)?.doc);
	const SLIDERS = [["brightness", "Brightness", 0, 200], ["contrast", "Contrast", 0, 200], ["saturation", "Saturation", 0, 200], ["hue", "Hue", -180, 180]] as const;
</script>

<div class="flex h-full w-full flex-col gap-2 overflow-auto bg-[#323232] p-3 text-xs text-[#ddd]">
	{#if doc}
		{#each SLIDERS as [key, label, min, max] (key)}
			<label class="flex items-center gap-2"><span class="w-20">{label}</span><input type="range" {min} {max} bind:value={doc.adjust[key]} class="flex-1" /><span class="w-9 text-right font-mono">{doc.adjust[key]}</span></label>
		{/each}
		<button class="mt-1 self-start rounded bg-[#1f1f1f] px-2 py-1 hover:bg-black" onclick={() => (doc.adjust = { brightness: 100, contrast: 100, saturation: 100, hue: 0 })}>Reset</button>
	{:else}
		<p class="opacity-60">Open a document.</p>
	{/if}
</div>
