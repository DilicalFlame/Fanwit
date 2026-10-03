<script lang="ts">
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import Trash2 from "@lucide/svelte/icons/trash-2";
	import Wrench from "@lucide/svelte/icons/wrench";
	import { Button } from "$lib/components/ui/button";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import { useInstaller } from "../installer.svelte";
	const inst = useInstaller();
	const info = inst.info!;
	const name = info.app.name;
	let purge = $state(false);
	const close = () => void getCurrentWindow().close();
	// only what Setup added is undone; tools that were already on the computer stay
	const undone = $derived((info.installed?.steps ?? []).filter((s) => s.ours));
	const kept = $derived((info.installed?.steps ?? []).filter((s) => !s.ours));
</script>

{#if inst.mode === "uninstall"}
	<!-- running, then done -->
	<div class="flex items-center gap-3">
		{#if inst.result === null}<LoaderCircle class="size-6 animate-spin text-primary" />{:else}<CircleCheck class="size-6 text-success" />{/if}
		<h1 class="text-xl font-semibold">{inst.result === null ? `Removing ${name}…` : `${name} was removed`}</h1>
	</div>
	<p class="mt-1 text-sm text-muted-foreground">Your documents and vaults are never touched.</p>
	<pre class="mt-5 max-h-60 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] whitespace-pre-wrap select-text">{inst.log.join("\n") || "…"}</pre>
	{#if inst.error}<p class="mt-3 text-sm text-destructive">{inst.error}</p>{/if}
	{#if inst.result !== null}<Button class="mt-5" onclick={close}>Close</Button>{/if}
{:else if inst.confirmUninstall}
	<!-- the uninstall page (Section 16.9.2): what goes, what stays -->
	<h1 class="text-xl font-semibold">Uninstall {name}</h1>
	{#if !info.installed}
		<p class="mt-2 text-sm text-muted-foreground">{name} does not seem to be installed in <code class="font-mono text-xs">{info.installDir}</code>. Nothing will be removed.</p>
		<Button class="mt-6" variant="outline" onclick={close}>Close</Button>
	{:else}
		<p class="mt-1 text-sm text-muted-foreground">Version {info.installed.version} will be removed from this computer.</p>
		<ul class="mt-5 space-y-2 text-sm">
			<li class="flex gap-2"><Trash2 class="mt-0.5 size-4 shrink-0 text-destructive" /> <span>Program files in <code class="rounded bg-muted px-1 font-mono text-xs">{info.installed.dir}</code>, shortcuts and the Apps and features entry</span></li>
			{#each undone as s (s.id)}
				<li class="flex gap-2"><Trash2 class="mt-0.5 size-4 shrink-0 text-destructive" /> <span>Undo: {s.title}</span></li>
			{/each}
			{#each kept as s (s.id)}
				<li class="flex gap-2 text-muted-foreground"><CircleCheck class="mt-0.5 size-4 shrink-0" /> <span>Kept: {s.title} (it was already on this computer)</span></li>
			{/each}
			<li class="flex gap-2 text-muted-foreground"><CircleCheck class="mt-0.5 size-4 shrink-0" /> <span>Kept: your documents and vaults</span></li>
		</ul>
		<label class="mt-6 flex items-center gap-2 text-sm"><Checkbox bind:checked={purge} /> Also remove settings and caches</label>
		<div class="mt-6 flex gap-2">
			<Button variant="destructive" onclick={() => inst.uninstall(purge)}>Uninstall</Button>
			<Button variant="ghost" onclick={() => (info.launch === "uninstall" ? close() : (inst.confirmUninstall = false))}>Cancel</Button>
		</div>
	{/if}
{:else}
	<h1 class="text-xl font-semibold">{name} is already installed</h1>
	<p class="mt-1 text-sm text-muted-foreground">Version {info.installed?.version} is on this computer. What would you like to do?</p>
	<div class="mt-6 grid gap-3">
		<button class="flex items-start gap-4 rounded-lg border border-border p-4 text-left hover:bg-accent/50" onclick={() => inst.repair()}>
			<Wrench class="mt-0.5 size-5 text-muted-foreground" />
			<span><span class="block font-medium">Repair or update</span><span class="block text-sm text-muted-foreground">Check every step again and fix whatever is missing.</span></span>
		</button>
		<button class="flex items-start gap-4 rounded-lg border border-border p-4 text-left hover:bg-accent/50" onclick={() => (inst.confirmUninstall = true)}>
			<Trash2 class="mt-0.5 size-5 text-destructive" />
			<span><span class="block font-medium">Uninstall</span><span class="block text-sm text-muted-foreground">Remove {name} and everything Setup added. Tools that were already here stay.</span></span>
		</button>
	</div>
{/if}
