<script lang="ts">
	import { ps } from "./ps.svelte";

	/** Foreground colour by hue, saturation and lightness sliders, plus the hex value. */
	function toHsl(hex: string): [number, number, number] {
		const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const l = (max + min) / 2;
		if (max === min) return [0, 0, Math.round(l * 100)];
		const d = max - min;
		const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
		return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)];
	}
	function toHex(h: number, s: number, l: number) {
		const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
		const f = (n: number) => {
			const k = (n + h / 30) % 12;
			return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0");
		};
		return `#${f(0)}${f(8)}${f(4)}`;
	}
	const hsl = $derived(toHsl(ps.color));
	const set = (i: number, v: number) => {
		const next = [...hsl] as [number, number, number];
		next[i] = v;
		ps.color = toHex(...next);
	};
	const TRACKS = ["linear-gradient(90deg, red, yellow, lime, cyan, blue, magenta, red)", "linear-gradient(90deg, #808080, currentColor)", "linear-gradient(90deg, black, currentColor, white)"];
</script>

<div class="flex h-full w-full flex-col gap-2 overflow-auto bg-[#323232] p-3 text-xs text-[#ddd]">
	<div class="flex items-center gap-2">
		<span class="size-8 rounded border border-white/30" style:background={ps.color}></span>
		<input class="w-24 rounded bg-[#1f1f1f] px-1.5 py-1 font-mono uppercase" value={ps.color} onchange={(e) => /^#[0-9a-f]{6}$/i.test(e.currentTarget.value) && (ps.color = e.currentTarget.value)} aria-label="Hex colour" />
	</div>
	{#each ["H", "S", "L"] as label, i (label)}
		<label class="flex items-center gap-2" style:color={ps.color}>
			<span class="w-3 text-[#ddd]">{label}</span>
			<input type="range" min="0" max={i ? 100 : 360} value={hsl[i]} oninput={(e) => set(i, Number(e.currentTarget.value))} class="h-2 flex-1 appearance-none rounded" style:background={TRACKS[i]} />
			<span class="w-8 text-right font-mono text-[#ddd]">{hsl[i]}</span>
		</label>
	{/each}
</div>
