<script lang="ts">
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import FolderOpen from "@lucide/svelte/icons/folder-open";
	import Lock from "@lucide/svelte/icons/lock";
	import { useInstaller } from "../installer.svelte";
	const inst = useInstaller();

	function toggle(id: string, on: boolean) {
		inst.components = on ? [...new Set([...inst.components, id])] : inst.components.filter((c) => c !== id);
	}
</script>

<h1 class="text-xl font-semibold">Choose components</h1>
<p class="mt-1 text-sm text-muted-foreground">Everything can be changed later by running Setup again.</p>
<ul class="mt-5 divide-y divide-border rounded-lg border border-border">
	{#each inst.info!.components as c (c.id)}
		<li>
			<label class="flex items-center gap-3 px-4 py-3 {c.required ? '' : 'cursor-pointer hover:bg-accent/50'}">
				<Checkbox checked={c.required || inst.components.includes(c.id)} disabled={c.required} onCheckedChange={(v) => toggle(c.id, v === true)} />
				<span class="flex-1 text-sm">
					{c.title || c.id}
					{#if c.required}<span class="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock class="size-3" /> required</span>{/if}
				</span>
				{#if c.size}<span class="text-xs text-muted-foreground tabular-nums">{c.size}</span>{/if}
			</label>
		</li>
	{/each}
</ul>
<!-- per user installs show the location inline (Figure 16.5, 3) -->
<div class="mt-5">
	<label class="text-sm font-medium" for="dir">Install to</label>
	<div class="mt-1.5 flex gap-2">
		<Input id="dir" class="font-mono text-xs" value={inst.installDir} oninput={(e) => inst.setInstallDir(e.currentTarget.value)} spellcheck={false} />
		<Button variant="outline" onclick={() => inst.browse()}><FolderOpen class="size-4" /> Browse…</Button>
	</div>
	<p class="mt-1.5 text-xs text-muted-foreground">A {inst.info!.app.name} folder is created inside the folder you pick.</p>
</div>
