<script lang="ts">
	/** Donut of traffic sources; hover a slice or a legend row to highlight it. */
	const DATA = [
		{ name: "Search", value: 42, color: "#6366f1" },
		{ name: "Direct", value: 24, color: "#0ea5e9" },
		{ name: "Social", value: 18, color: "#ec4899" },
		{ name: "Referral", value: 10, color: "#f59e0b" },
		{ name: "Email", value: 6, color: "#14b8a6" }
	];
	let active = $state<string | null>(null);
	const total = DATA.reduce((s, d) => s + d.value, 0);
	const C = 2 * Math.PI * 38;
	const slices = DATA.reduce<{ d: (typeof DATA)[number]; offset: number }[]>((acc, d) => [...acc, { d, offset: acc.reduce((s, a) => s + a.d.value, 0) }], []);
	const shown = $derived(DATA.find((d) => d.name === active));
</script>

<div class="flex h-full w-full items-center gap-4 p-3">
	<svg viewBox="0 0 100 100" class="h-full max-h-40 shrink-0" role="img" aria-label="Traffic sources">
		{#each slices as { d, offset } (d.name)}
			<circle
				role="presentation"
				cx="50"
				cy="50"
				r="38"
				fill="none"
				stroke={d.color}
				stroke-width={active === d.name ? 16 : 12}
				stroke-dasharray="{(d.value / total) * C} {C}"
				stroke-dashoffset={-(offset / total) * C}
				transform="rotate(-90 50 50)"
				class="transition-[stroke-width]"
				onpointerenter={() => (active = d.name)}
				onpointerleave={() => (active = null)}
			/>
		{/each}
		<text x="50" y="48" text-anchor="middle" class="fill-current text-[12px] font-semibold">{shown ? `${shown.value}%` : "100%"}</text>
		<text x="50" y="60" text-anchor="middle" class="fill-muted-foreground text-[7px]">{shown?.name ?? "all sources"}</text>
	</svg>
	<ul class="flex min-w-0 flex-col gap-1 text-xs">
		{#each DATA as d (d.name)}
			<li class="flex items-center gap-2 rounded px-1 {active === d.name ? 'bg-accent' : ''}" onpointerenter={() => (active = d.name)} onpointerleave={() => (active = null)}>
				<span class="size-2.5 rounded-sm" style:background={d.color}></span><span class="flex-1">{d.name}</span><span class="tabular-nums text-muted-foreground">{d.value}%</span>
			</li>
		{/each}
	</ul>
</div>
