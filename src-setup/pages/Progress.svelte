<script lang="ts">
	import Check from "@lucide/svelte/icons/check";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import Circle from "@lucide/svelte/icons/circle";
	import Clock from "@lucide/svelte/icons/clock";
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import X from "@lucide/svelte/icons/x";
	import { Progress } from "$lib/components/ui/progress";
	import { onMount, tick } from "svelte";
	import { useInstaller } from "../installer.svelte";
	let { compact = false }: { compact?: boolean } = $props();
	const inst = useInstaller();
	let details = $state(false);
	let logEl = $state<HTMLPreElement>();

	onMount(() => {
		// the one-click preset starts installing as soon as it opens
		if (compact && inst.result === null && !Object.keys(inst.steps).length) void inst.install();
	});
	$effect(() => {
		void inst.log.length;
		void tick().then(() => logEl && (logEl.scrollTop = logEl.scrollHeight));
	});
	const failed = $derived(inst.result !== null && inst.result !== 0 && inst.result !== 3010);
	const current = $derived(inst.rows.find((r) => inst.steps[r.id]?.state === "running"));
	const position = $derived(Math.max(1, inst.rows.findIndex((r) => r.id === current?.id) + 1));
</script>

{#if compact}
	<h1 class="text-2xl font-semibold">Setting up {inst.info!.app.name}</h1>
	<p class="mt-2 text-sm text-muted-foreground">{failed ? "Setup could not finish." : (current?.title ?? (inst.result === null ? "Preparing…" : "Done"))}</p>
	<Progress class="mt-6 h-2" value={inst.progress} />
{:else}
	<h1 class="text-xl font-semibold">{inst.result === null ? `Installing ${inst.info!.app.name}` : failed ? "Installation did not finish" : "Installed"}</h1>
	<p class="mt-1 text-sm text-muted-foreground">
		{#if inst.result === null}Step {position} of {inst.rows.length}
		{:else if inst.result === 1602}Cancelled. Everything that was done has been undone.
		{:else if failed}Something went wrong, and completed steps were rolled back. See the details below.
		{:else if inst.result === 3010}Done. Restart your computer to finish.
		{:else}Everything is in place.{/if}
	</p>
	<!-- overall progress (Figure 16.6, 1) -->
	<Progress class="mt-4 h-1.5" value={inst.progress} />
	<!-- step list (Figure 16.6, 2) -->
	<ul class="mt-5 space-y-2.5">
		{#each inst.rows as r (r.id)}
			{@const s = inst.steps[r.id]?.state ?? "pending"}
			<li class="flex items-start gap-3 text-sm">
				<span class="mt-0.5 grid size-4 place-items-center">
					{#if s === "running"}<LoaderCircle class="size-4 animate-spin text-primary" />
					{:else if s === "done" || s === "ok"}<Check class="size-4 text-success" />
					{:else if s === "failed" || s === "blocked"}<X class="size-4 text-destructive" />
					{:else if s === "deferred"}<Clock class="size-4 text-muted-foreground" />
					{:else}<Circle class="size-3 text-muted-foreground/50" />{/if}
				</span>
				<span class="flex-1 {s === 'pending' ? 'text-muted-foreground' : ''}">
					{r.title}
					{#if inst.steps[r.id]?.detail}<span class="block text-xs text-muted-foreground">{inst.steps[r.id].detail}</span>{/if}
				</span>
			</li>
		{/each}
	</ul>
	<!-- details: the engine journal (Figure 16.6, 3) -->
	<button class="mt-5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onclick={() => (details = !details)} data-no-press>
		<ChevronRight class="size-3.5 transition-transform {details ? 'rotate-90' : ''}" />
		{details ? "Hide" : "Show"} details
	</button>
	{#if details || failed}
		<pre bind:this={logEl} class="mt-2 max-h-36 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text">{inst.log.join("\n") || "…"}</pre>
	{/if}
{/if}
