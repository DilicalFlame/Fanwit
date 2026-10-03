<script lang="ts">
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import { useInstaller } from "../installer.svelte";
	import StatusPill from "./StatusPill.svelte";
	const inst = useInstaller();
</script>

<h1 class="text-xl font-semibold">Prerequisites</h1>
<p class="mt-1 text-sm text-muted-foreground">We checked what {inst.info!.app.name} needs on this computer.</p>
{#if !inst.plan}
	<div class="mt-10 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle class="size-4 animate-spin" /> Checking…</div>
{:else if !inst.plan.items.length}
	<p class="mt-6 rounded-lg border border-border p-4 text-sm text-muted-foreground">Nothing else is needed. {inst.info!.app.name} is self contained.</p>
{:else}
	<!-- prerequisite rows: results of each step's check (Figure 16.5, 4) -->
	<ul class="mt-5 divide-y divide-border rounded-lg border border-border">
		{#each inst.plan.items as i (i.id)}
			<li class="flex items-start gap-3 px-4 py-3">
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">{i.title}</div>
					{#if i.detail}<div class="mt-0.5 text-xs text-muted-foreground">{i.detail}</div>{/if}
				</div>
				<StatusPill status={i.status} />
			</li>
		{/each}
	</ul>
	{#if inst.plan.blocked}
		<p class="mt-4 text-sm text-destructive">Something required cannot be installed on this computer. Connect to the internet or contact the publisher.</p>
	{/if}
{/if}
