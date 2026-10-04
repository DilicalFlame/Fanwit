<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import { activeDoc } from "./ps.svelte";

	/** Steps taken on the active document, newest last. */
	const k = getKernel();
	const cur = $derived(activeDoc(k));
</script>

<div class="h-full w-full overflow-auto bg-[#323232] py-1 text-xs text-[#ddd]">
	{#if cur}
		<div class="px-3 py-1 font-medium">{cur.name}</div>
		{#each cur.doc.history as step, i (i)}
			<div class="flex h-6 items-center gap-2 px-3 {i === cur.doc.history.length - 1 ? 'bg-[#1473e6]/40' : ''}"><Icon name={step === "Open" ? "image" : step.startsWith("Brush") ? "brush" : step === "Eraser" ? "eraser" : "layers"} size={12} />{step}</div>
		{/each}
	{/if}
</div>
