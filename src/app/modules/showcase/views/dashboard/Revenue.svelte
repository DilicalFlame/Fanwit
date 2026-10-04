<script lang="ts">
	import { dash, fmt, series } from "./data.svelte";

	/** Area chart of daily revenue with a range switch and a hover read out. */
	let w = $state(400);
	let h = $state(200);
	let hover = $state<number | null>(null);
	const data = $derived(series(dash.range));
	const max = $derived(Math.max(...data.map((d) => d.value)) * 1.1);
	const pad = { l: 40, r: 8, t: 8, b: 20 };
	const x = (i: number) => pad.l + (i / Math.max(1, data.length - 1)) * (w - pad.l - pad.r);
	const y = (v: number) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
	const path = $derived(data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join(""));
	const ticks = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => max * f));

	function move(e: PointerEvent) {
		const r = (e.currentTarget as SVGElement).getBoundingClientRect();
		const i = Math.round(((e.clientX - r.left - pad.l) / (w - pad.l - pad.r)) * (data.length - 1));
		hover = i >= 0 && i < data.length ? i : null;
	}
</script>

<div class="flex h-full w-full flex-col p-2">
	<div class="mb-1 flex items-center gap-2 text-xs">
		<span class="font-semibold">${fmt(data.reduce((s, d) => s + d.value, 0))}</span><span class="text-muted-foreground">in {dash.range} days</span>
		<div role="radiogroup" aria-label="Range" class="ml-auto flex rounded-md border border-border p-0.5">
			{#each [7, 30, 90] as r (r)}<button role="radio" aria-checked={dash.range === r} class="rounded px-2 py-0.5 {dash.range === r ? 'bg-accent' : ''}" onclick={() => (dash.range = r as 7 | 30 | 90)}>{r}d</button>{/each}
		</div>
	</div>
	<div class="relative min-h-0 flex-1" bind:clientWidth={w} bind:clientHeight={h}>
		<svg class="absolute inset-0 size-full" role="img" aria-label="Revenue per day" onpointermove={move} onpointerleave={() => (hover = null)}>
			<defs><linearGradient id="rev-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#6366f1" stop-opacity="0.35" /><stop offset="1" stop-color="#6366f1" stop-opacity="0" /></linearGradient></defs>
			{#each ticks as t (t)}
				<line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} class="stroke-border" />
				<text x={pad.l - 6} y={y(t) + 3} text-anchor="end" class="fill-muted-foreground text-[10px]">{fmt(t / 1000, 1)}k</text>
			{/each}
			<path d="{path}L{x(data.length - 1)},{h - pad.b}L{x(0)},{h - pad.b}Z" fill="url(#rev-fill)" />
			<path d={path} fill="none" stroke="#6366f1" stroke-width="2" />
			{#if hover !== null}
				<line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={h - pad.b} class="stroke-muted-foreground" stroke-dasharray="3 3" />
				<circle cx={x(hover)} cy={y(data[hover].value)} r="4" fill="#6366f1" />
			{/if}
		</svg>
		{#if hover !== null}
			<div class="pointer-events-none absolute rounded-md border border-border bg-popover px-2 py-1 text-xs shadow" style:left="{Math.min(w - 110, x(hover) + 8)}px" style:top="{Math.max(0, y(data[hover].value) - 36)}px">Day {hover + 1}: <b>${fmt(data[hover].value)}</b></div>
		{/if}
	</div>
</div>
