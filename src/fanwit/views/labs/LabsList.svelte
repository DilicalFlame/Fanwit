<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";

	/** Labs: try every system interactively and copy the generated code. */
	const k = getKernel();
	const labs = $derived([...k.sys.layout.views.values()].filter((v) => v.category === "Labs"));
</script>

<ul class="flex flex-col p-1">
	{#each labs as v (v.id)}
		<li>
			<button class="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent" onclick={() => k.sys.layout.openView(v.id).catch((e) => k.sys.notify.error(e))}>
				<Icon name={v.icon ?? "flask-conical"} size={16} class="mt-0.5 text-primary" />
				<span class="flex flex-col"><span class="text-[13px] font-medium">{typeof v.title === "string" ? v.title : v.id}</span>{#if v.description}<span class="text-[11px] text-muted-foreground">{v.description}</span>{/if}</span>
			</button>
		</li>
	{/each}
</ul>
