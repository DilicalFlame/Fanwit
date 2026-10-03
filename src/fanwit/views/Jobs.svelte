<script lang="ts">
	import { getKernel } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import EmptyState from "../workbench/EmptyState.svelte";

	/** Background jobs with progress and cancellation. */
	const k = getKernel();
	const jobs = k.sys.jobs;
	const ICON = { queued: "clock", running: "loader-circle", done: "circle-check", failed: "circle-x", cancelled: "circle-slash" } as const;
</script>

{#if !jobs.jobs.length}
	<EmptyState icon="list-checks" title="No jobs" description="Long running work (indexing, backups, exports) shows progress here.">
		<button class="fw-btn" onclick={() => jobs.run("Demo job", async ({ report, signal }) => { for (let i = 1; i <= 20 && !signal.aborted; i++) { await new Promise((r) => setTimeout(r, 150)); report(i / 20, `Step ${i} of 20`); } }, { cancellable: true }).catch(() => {})}>Run a demo job</button>
	</EmptyState>
{:else}
	<ul class="h-full overflow-auto p-2 text-xs">
		{#each jobs.jobs as j (j.id)}
			<li class="flex items-center gap-2 border-b border-border/60 py-1.5">
				<Icon name={ICON[j.state]} size={14} class={j.state === "running" ? "animate-spin" : j.state === "failed" ? "text-destructive" : ""} />
				<span class="w-48 truncate font-medium">{j.title}</span>
				<div class="h-1.5 flex-1 overflow-hidden rounded bg-muted"><div class="h-full bg-primary" style:width="{(j.fraction ?? (j.state === "done" ? 1 : 0)) * 100}%"></div></div>
				<span class="w-40 truncate text-muted-foreground">{j.error ?? j.message ?? j.state}</span>
				{#if j.state === "running"}<button class="fw-btn h-6" onclick={() => j.cancel()}>Cancel</button>{/if}
			</li>
		{/each}
	</ul>
{/if}
