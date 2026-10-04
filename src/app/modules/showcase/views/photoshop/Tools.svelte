<script lang="ts">
	import Icon from "$fanwit/icons/Icon.svelte";
	import { ps, type Tool } from "./ps.svelte";

	/** The tool strip, with foreground and background colour chips. */
	const TOOLS: [Tool, string, string][] = [
		["move", "move", "Move (V)"],
		["brush", "brush", "Brush (B)"],
		["eraser", "eraser", "Eraser (E)"],
		["fill", "paint-bucket", "Fill layer (G)"],
		["eyedropper", "pipette", "Eyedropper (I)"]
	];
</script>

<div class="flex h-full w-full flex-col items-center gap-1 bg-[#323232] py-2 text-[#ddd]" role="toolbar" aria-orientation="vertical" aria-label="Tools">
	{#each TOOLS as [id, icon, label] (id)}
		<button class="flex size-8 items-center justify-center rounded {ps.tool === id ? 'bg-[#1473e6] text-white' : 'hover:bg-white/10'}" aria-pressed={ps.tool === id} title={label} onclick={() => (ps.tool = id)}><Icon name={icon} size={16} /></button>
	{/each}
	<div class="relative mt-3 size-9">
		<input type="color" class="absolute right-0 bottom-0 size-6 cursor-pointer rounded-sm border border-white/40 bg-transparent p-0" bind:value={ps.color2} aria-label="Background colour" />
		<input type="color" class="absolute top-0 left-0 size-6 cursor-pointer rounded-sm border border-white/40 bg-transparent p-0" bind:value={ps.color} aria-label="Foreground colour" />
	</div>
	<button class="rounded p-1 hover:bg-white/10" title="Swap colours" aria-label="Swap colours" onclick={() => ([ps.color, ps.color2] = [ps.color2, ps.color])}><Icon name="arrow-left-right" size={13} /></button>
</div>
