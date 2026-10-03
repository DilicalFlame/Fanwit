<script lang="ts">
	import { getKernel } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";

	/** Plugins in the sidebar: quick toggles and a door to the Plugin Manager. */
	const k = getKernel();
	const svc = $derived(k.sys.plugins);
</script>

<div class="flex h-full flex-col text-[13px]">
	<ul class="min-h-0 flex-1 overflow-auto py-1">
		{#each svc?.installed ?? [] as p (p.scope + p.manifest.id)}
			<li class="flex items-center gap-2 px-3 py-1">
				<Icon name="puzzle" size={14} class="opacity-60" />
				<span class="flex-1 truncate" title={p.error ?? p.manifest.description}>{p.manifest.name}</span>
				<input type="checkbox" aria-label="Enable {p.manifest.name}" checked={p.enabled} onchange={() => svc?.setEnabled(p.manifest.id, p.scope, !p.enabled)} />
			</li>
		{:else}
			<li class="px-3 py-2 text-xs text-muted-foreground">No plugins installed.</li>
		{/each}
	</ul>
	<button class="fw-btn m-2" onclick={() => k.commands.run("plugins.open")}><Icon name="puzzle" size={13} />Plugin Manager</button>
</div>
