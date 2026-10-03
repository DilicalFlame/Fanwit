<script lang="ts">
	import { Input } from "$lib/components/ui/input";
	import { Switch } from "$lib/components/ui/switch";
	import { useInstaller } from "../installer.svelte";
	const inst = useInstaller();
</script>

<h1 class="text-xl font-semibold">Options</h1>
<p class="mt-1 text-sm text-muted-foreground">Fine tune how {inst.info!.app.name} fits into your system.</p>
<ul class="mt-5 divide-y divide-border rounded-lg border border-border">
	{#each inst.visibleOptions as o (o.id)}
		<li class="flex items-center gap-4 px-4 py-3">
			<label class="flex-1 text-sm" for={`opt-${o.id}`}>{o.title || o.id}</label>
			{#if o.type === "boolean"}
				<Switch id={`opt-${o.id}`} checked={inst.options[o.id] === true} onCheckedChange={(v) => (inst.options[o.id] = v)} />
			{:else}
				<Input id={`opt-${o.id}`} class="w-56" value={String(inst.options[o.id] ?? "")} oninput={(e) => (inst.options[o.id] = e.currentTarget.value)} />
			{/if}
		</li>
	{/each}
</ul>
