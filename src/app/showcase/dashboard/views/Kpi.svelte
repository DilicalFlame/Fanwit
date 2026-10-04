<script lang="ts">
	import { untrack } from "svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import { dash, fmt, METRICS, startLive } from "./data.svelte";

	/** A live metric: value, change against the first sample, sparkline. */
	let { props }: { props: { metric?: string } } = $props();
	const key = untrack(() => props.metric) ?? "revenue"; // the pane's identity
	const m = METRICS[key];
	startLive();
	const s = $derived(dash.live[key]);
	const now = $derived(s[s.length - 1]);
	const change = $derived(((now - s[0]) / s[0]) * 100);
	const good = $derived(m.good === "up" ? change >= 0 : change <= 0);
	const line = $derived.by(() => {
		const min = Math.min(...s);
		const max = Math.max(...s);
		return s.map((v, i) => `${(i / (s.length - 1)) * 100},${30 - ((v - min) / (max - min || 1)) * 28}`).join(" ");
	});
</script>

<div class="flex h-full w-full flex-col justify-between p-3">
	<div class="text-2xl font-semibold tabular-nums">{m.unit === "$" ? "$" : ""}{fmt(now, m.digits)}{m.unit !== "$" ? m.unit : ""}</div>
	<div class="flex items-end justify-between gap-2">
		<span class="flex items-center gap-1 text-xs font-medium {good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
			<Icon name={change >= 0 ? "trending-up" : "trending-down"} size={14} />{change >= 0 ? "+" : ""}{change.toFixed(1)}%
		</span>
		<svg viewBox="0 0 100 32" class="h-8 w-24" preserveAspectRatio="none" aria-hidden="true"><polyline points={line} fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" class={good ? "text-emerald-500" : "text-rose-500"} /></svg>
	</div>
</div>
