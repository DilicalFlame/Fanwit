/** Dashboard showcase data: seeded so it looks the same each run, with a few live ticking numbers. */
export function rng(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export const METRICS: Record<string, { label: string; base: number; unit: string; digits: number; good: "up" | "down" }> = {
	revenue: { label: "Revenue", base: 48200, unit: "$", digits: 0, good: "up" },
	users: { label: "Active users", base: 3120, unit: "", digits: 0, good: "up" },
	conversion: { label: "Conversion", base: 3.4, unit: "%", digits: 2, good: "up" },
	latency: { label: "p95 latency", base: 182, unit: "ms", digits: 0, good: "down" }
};

export const dash = $state({
	range: 30 as 7 | 30 | 90,
	/** Last 20 samples per metric, newest last. */
	live: Object.fromEntries(Object.entries(METRICS).map(([k, m], i) => {
		const r = rng(i + 1);
		return [k, Array.from({ length: 20 }, () => m.base * (0.9 + r() * 0.2))];
	})) as Record<string, number[]>
});

let timer: ReturnType<typeof setInterval> | undefined;
/** Start the live feed once a card is on screen. */
export function startLive() {
	timer ??= setInterval(() => {
		for (const [k, m] of Object.entries(METRICS)) {
			const s = dash.live[k];
			const next = Math.max(m.base * 0.6, s[s.length - 1] * (0.97 + Math.random() * 0.06));
			dash.live[k] = [...s.slice(1), next];
		}
	}, 2000);
}

export function series(days: number, seed = 7): { day: number; value: number }[] {
	const r = rng(seed + days);
	let v = 1200;
	return Array.from({ length: days }, (_, day) => ({ day, value: (v = Math.max(300, v + (r() - 0.42) * 260)) }));
}

export const fmt = (v: number, digits = 0) => v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
