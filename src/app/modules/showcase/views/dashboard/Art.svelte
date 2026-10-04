<script lang="ts">
	import { rng } from "./data.svelte";

	/** A generated "photo" for a seed: gradient sky, blobs and waves. No network needed. */
	let { seed, class: cls = "" }: { seed: number; class?: string } = $props();
	const art = $derived.by(() => {
		const r = rng(seed * 97 + 13);
		const hue = Math.floor(r() * 360);
		return {
			hue,
			blobs: Array.from({ length: 5 }, () => ({ x: r() * 100, y: r() * 70, rad: 6 + r() * 22, h: (hue + r() * 120) % 360, o: 0.35 + r() * 0.5 })),
			waves: Array.from({ length: 3 }, (_, i) => ({ y: 62 + i * 12, amp: 3 + r() * 8, h: (hue + 180 + i * 25) % 360 }))
		};
	});
</script>

<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" class={cls} aria-hidden="true">
	<defs>
		<linearGradient id="sky-{seed}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="hsl({art.hue} 70% 55%)" /><stop offset="1" stop-color="hsl({(art.hue + 60) % 360} 80% 75%)" /></linearGradient>
	</defs>
	<rect width="100" height="100" fill="url(#sky-{seed})" />
	{#each art.blobs as b, i (i)}<circle cx={b.x} cy={b.y} r={b.rad} fill="hsl({b.h} 85% 65%)" opacity={b.o} />{/each}
	{#each art.waves as wv, i (i)}<path d="M0 {wv.y} Q 25 {wv.y - wv.amp} 50 {wv.y} T 100 {wv.y} V100 H0 Z" fill="hsl({wv.h} 45% {30 + i * 8}%)" />{/each}
</svg>
