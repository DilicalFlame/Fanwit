<script lang="ts">
	import { onDestroy } from "svelte";
	import { getKernel } from "../../ui.svelte";

	/** Module profiler and performance HUD: activation time and event per module, startup marks, frames. */
	const k = getKernel();
	const marks = $derived(Object.entries(k.lifecycle.marks).sort(([, a], [, b]) => a - b));
	let fps = $state(0);
	let longTasks = $state(0);
	let mem = $state<number | null>(null);
	let frames = 0;
	let last = performance.now();
	let raf = 0;
	const loop = () => {
		frames++;
		const now = performance.now();
		if (now - last > 1000) {
			fps = Math.round((frames * 1000) / (now - last));
			frames = 0;
			last = now;
			mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
		}
		raf = requestAnimationFrame(loop);
	};
	raf = requestAnimationFrame(loop);
	let po: PerformanceObserver | null = null;
	try {
		po = new PerformanceObserver((l) => (longTasks += l.getEntries().length));
		po.observe({ type: "longtask", buffered: true });
	} catch {
		po = null;
	}
	onDestroy(() => {
		cancelAnimationFrame(raf);
		po?.disconnect();
	});
</script>

<div class="h-full overflow-auto p-3 text-xs">
	<div class="mb-3 flex gap-4">
		<span><b>{fps}</b> fps</span><span><b>{longTasks}</b> long tasks</span>{#if mem}<span><b>{Math.round(mem / 1048576)}</b> MB heap</span>{/if}
	</div>
	<div class="fw-section-title px-0">Startup marks</div>
	{#each marks as [name, t] (name)}<div class="flex gap-2 font-mono"><span class="w-24">{name}</span><span>{t.toFixed(0)} ms</span></div>{/each}
	<div class="fw-section-title px-0">Modules</div>
	<table class="w-full">
		<thead class="text-left text-muted-foreground"><tr><th>Module</th><th>Tier</th><th>Status</th><th>Activated by</th><th class="text-right">ms</th></tr></thead>
		<tbody>
			{#each k.modules.list() as m (m.def.id)}
				<tr class="border-t border-border/50">
					<td class="py-0.5 font-mono">{m.def.id}</td><td>{m.def.tier ?? "module"}</td>
					<td class={m.status === "failed" ? "text-destructive" : m.status === "active" ? "text-success" : "text-muted-foreground"} title={m.error}>{m.status}</td>
					<td class="text-muted-foreground">{m.activatedBy ?? ""}</td>
					<td class="text-right tabular-nums {(m.activationMs ?? 0) > 50 ? 'font-semibold text-warning' : ''}">{m.activationMs ?? ""}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
