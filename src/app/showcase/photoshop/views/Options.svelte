<script lang="ts">
	import Icon from "$fanwit/icons/Icon.svelte";
	import { ps } from "./ps.svelte";

	/** The options bar: settings of the current tool. */
	const NAMES = { move: "Move", brush: "Brush", eraser: "Eraser", fill: "Fill layer", eyedropper: "Eyedropper" };
	const ICONS = { move: "move", brush: "brush", eraser: "eraser", fill: "paint-bucket", eyedropper: "pipette" };
</script>

<div class="flex h-full w-full items-center gap-4 bg-[#323232] px-3 text-xs text-[#ddd]">
	<span class="flex items-center gap-1.5 font-medium"><Icon name={ICONS[ps.tool]} size={15} />{NAMES[ps.tool]}</span>
	{#if ps.tool === "brush" || ps.tool === "eraser"}
		<label class="flex items-center gap-2">Size <input type="range" min="1" max="120" bind:value={ps.size} class="w-28" /><span class="w-10 font-mono">{ps.size} px</span></label>
	{/if}
	{#if ps.tool === "brush" || ps.tool === "eraser" || ps.tool === "fill"}
		<label class="flex items-center gap-2">Opacity <input type="range" min="1" max="100" bind:value={ps.opacity} class="w-28" /><span class="w-10 font-mono">{ps.opacity}%</span></label>
	{/if}
	{#if ps.tool === "eyedropper"}<span class="opacity-70">Click the canvas to pick the foreground colour.</span>{/if}
	{#if ps.tool === "move"}<span class="opacity-70">Drag documents by their tabs: dock them side by side or into another window.</span>{/if}
	<span class="ml-auto flex items-center gap-1.5">Colour <span class="size-4 rounded-sm border border-white/40" style:background={ps.color}></span><span class="font-mono uppercase">{ps.color}</span></span>
</div>
