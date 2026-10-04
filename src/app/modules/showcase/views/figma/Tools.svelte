<script lang="ts">
	import Icon from "$fanwit/icons/Icon.svelte";
	import { figma, type Tool } from "./figma.svelte";

	/** The floating tool bar. */
	const TOOLS: [Tool, string, string, string][] = [
		["move", "mouse-pointer-2", "Move", "V"],
		["frame", "frame", "Frame", "F"],
		["rect", "square", "Rectangle", "R"],
		["ellipse", "circle", "Ellipse", "O"],
		["text", "type", "Text", "T"],
		["hand", "hand", "Hand", "H"]
	];
</script>

<div class="flex h-full w-full items-center gap-1 px-2" role="toolbar" aria-label="Tools">
	{#each TOOLS as [id, icon, label, key] (id)}
		<button class="flex size-9 items-center justify-center rounded-md {figma.tool === id ? 'bg-[#0d99ff] text-white' : 'hover:bg-accent'}" aria-pressed={figma.tool === id} title="{label} ({key})" onclick={() => (figma.tool = id)}>
			<Icon name={icon} size={17} />
		</button>
	{/each}
	<span class="ml-auto font-mono text-xs text-muted-foreground">{Math.round(figma.zoom * 100)}%</span>
</div>
