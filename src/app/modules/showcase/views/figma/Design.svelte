<script lang="ts">
	import { figma, removeSelected, selectedShape } from "./figma.svelte";

	/** Properties of the selection; the canvas zoom when nothing is selected. */
	const s = $derived(selectedShape());
	const num = (v: string) => Math.round(Number(v) || 0);
</script>

<div class="flex h-full w-full flex-col gap-4 overflow-auto p-3 text-xs">
	{#if s}
		<section>
			<div class="mb-2 font-semibold">{s.name}</div>
			<div class="grid grid-cols-2 gap-2">
				{#each [["X", "x"], ["Y", "y"], ["W", "w"], ["H", "h"]] as [label, key] (key)}
					<label class="flex items-center gap-1.5"><span class="w-3 text-muted-foreground">{label}</span><input class="fw-input h-7 min-w-0 flex-1 px-1.5" type="number" value={s[key as "x"]} oninput={(e) => (s[key as "x"] = num(e.currentTarget.value))} /></label>
				{/each}
			</div>
		</section>
		{#if s.type !== "ellipse" && s.type !== "text"}
			<label class="flex items-center justify-between gap-2"><span>Corner radius</span><input class="fw-input h-7 w-20 px-1.5" type="number" min="0" bind:value={s.radius} /></label>
		{/if}
		{#if s.type === "text"}
			<label class="flex flex-col gap-1"><span>Text</span><input class="fw-input h-7 px-1.5" bind:value={s.text} /></label>
		{/if}
		<section>
			<div class="mb-2 font-semibold">Fill</div>
			<div class="flex items-center gap-2">
				<input type="color" class="size-7 cursor-pointer rounded border border-border bg-transparent" bind:value={s.fill} aria-label="Fill colour" />
				<span class="font-mono uppercase">{s.fill}</span>
				<input class="fw-input ml-auto h-7 w-16 px-1.5" type="number" min="0" max="100" bind:value={s.opacity} aria-label="Opacity" /><span>%</span>
			</div>
		</section>
		<button class="fw-btn self-start" onclick={removeSelected}>Delete layer</button>
	{:else}
		<div class="font-semibold">Canvas</div>
		<div class="flex items-center justify-between gap-2"><span>Zoom</span><span class="font-mono">{Math.round(figma.zoom * 100)}%</span></div>
		<div class="flex gap-2">
			<button class="fw-btn" onclick={() => (figma.zoom = 1)}>100%</button>
			<button class="fw-btn" onclick={() => ((figma.zoom = 1), (figma.pan = { x: 300, y: 80 }))}>Reset view</button>
		</div>
		<p class="text-muted-foreground">Select a layer to edit it. Draw with R, O, F or T; pan with the wheel or H; zoom with Ctrl+wheel.</p>
	{/if}
</div>
