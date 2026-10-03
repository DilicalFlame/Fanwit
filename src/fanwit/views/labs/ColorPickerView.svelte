<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import { parseColor, rgbToOklch, toHex, toOklchString } from "../../themes/color";

	/** Sample tool panel: an OKLCH colour picker (a native panel window, a float or a PiP on the web). */
	const k = getKernel();
	let l = $state(0.65);
	let c = $state(0.15);
	let h = $state(250);
	let opacity = $state(100);
	const value = $derived(toOklchString({ l, c, h, a: opacity / 100 }));
	const hex = $derived(toHex(parseColor(value)!));
	function fromHex(v: string) {
		const o = rgbToOklch(parseColor(v)!);
		l = +o.l.toFixed(3);
		c = +o.c.toFixed(3);
		h = Math.round(o.h);
	}
</script>

<div class="flex h-full flex-col gap-3 p-3 text-xs">
	<div class="h-20 rounded-lg border border-border" style:background={value}></div>
	{#each [["Lightness", 0, 1, 0.01], ["Chroma", 0, 0.37, 0.005], ["Hue", 0, 360, 1]] as [label, min, max, step], i (label)}
		<label class="flex items-center gap-2"><span class="w-16">{label}</span>
			{#if i === 0}<input type="range" class="flex-1" min={min as number} max={max as number} step={step as number} bind:value={l} />
			{:else if i === 1}<input type="range" class="flex-1" min={min as number} max={max as number} step={step as number} bind:value={c} />
			{:else}<input type="range" class="flex-1" min={min as number} max={max as number} step={step as number} bind:value={h} />{/if}
		</label>
	{/each}
	<label class="flex items-center gap-2"><span class="w-16">Opacity</span><input type="range" class="flex-1" min="0" max="100" bind:value={opacity} />{opacity}%</label>
	<div class="flex gap-2"><input class="fw-input h-7 font-mono text-xs" value={hex} onchange={(e) => fromHex((e.currentTarget as HTMLInputElement).value)} aria-label="Hex" /></div>
	<div class="selectable font-mono text-[11px] text-muted-foreground">{value}</div>
	<button class="fw-btn" onclick={() => k.commands.run("clipboard.copy", { text: value })}>Copy</button>
</div>
