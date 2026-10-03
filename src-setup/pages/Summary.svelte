<script lang="ts">
	import Download from "@lucide/svelte/icons/download";
	import HardDrive from "@lucide/svelte/icons/hard-drive";
	import ShieldCheck from "@lucide/svelte/icons/shield-check";
	import { useInstaller, size } from "../installer.svelte";
	const inst = useInstaller();
	const pending = $derived((inst.plan?.items ?? []).filter((i) => i.status === "missing" || i.status === "outdated"));
	const admin = $derived(!!inst.plan?.elevation || inst.scope === "machine");
</script>

<h1 class="text-xl font-semibold">Ready to install</h1>
<p class="mt-1 text-sm text-muted-foreground">This is everything that will happen. Nothing has changed yet.</p>
{#if inst.plan}
	<!-- plan summary: download, disk and privilege needs (Figure 16.5, 5) -->
	<div class="mt-5 grid grid-cols-3 gap-3 text-sm">
		<div class="rounded-lg border border-border p-3">
			<Download class="size-4 text-muted-foreground" />
			<div class="mt-2 font-medium">{size(inst.plan.download)}</div>
			<div class="text-xs text-muted-foreground">download</div>
		</div>
		<div class="rounded-lg border border-border p-3">
			<HardDrive class="size-4 text-muted-foreground" />
			<div class="mt-2 font-medium">{size(inst.plan.disk + (inst.info!.payload?.size ?? 0) * 3)}</div>
			<div class="text-xs text-muted-foreground">disk space</div>
		</div>
		<div class="rounded-lg border border-border p-3">
			<ShieldCheck class="size-4 text-muted-foreground" />
			<div class="mt-2 font-medium">{admin ? "Admin needed" : "No admin rights"}</div>
			<div class="text-xs text-muted-foreground">{inst.scope === "machine" ? "for everyone" : "just for you"}</div>
		</div>
	</div>
	<ol class="mt-5 space-y-2 text-sm">
		<li class="flex gap-2"><span class="text-muted-foreground">→</span> <span>Install {inst.info!.app.name} {inst.info!.app.version} to <code class="rounded bg-muted px-1 font-mono text-xs">{inst.installDir}</code></span></li>
		{#each pending as i (i.id)}
			<li class="flex gap-2">
				<span class="text-muted-foreground">→</span>
				<span>{i.detail || i.title}{#if i.phase === "firstRun"}<span class="text-muted-foreground"> (on first launch)</span>{/if}</span>
			</li>
		{/each}
		<li class="flex gap-2 text-muted-foreground"><span>→</span> <span>Components: {inst.components.join(", ")}</span></li>
	</ol>
{/if}
