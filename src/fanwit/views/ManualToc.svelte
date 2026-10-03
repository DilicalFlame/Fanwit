<script lang="ts">
	import { getKernel } from "../ui.svelte";
	import { pages, sections, type DocPage } from "../manual/docs";

	/** Manual table of contents in the sidebar; pages open in the Manual window. */
	const k = getKernel();
	let list = $state<DocPage[]>([]);
	$effect(() => void pages(k).then((l) => (list = l)));
</script>

<div class="h-full overflow-auto pb-3 text-[13px]">
	{#each sections(list) as [section, ps] (section)}
		<div class="fw-section-title">{section}</div>
		{#each ps as p (p.id)}
			<button class="block w-full truncate px-4 py-0.5 text-left hover:bg-sidebar-accent" onclick={() => k.commands.run("manual.open", { page: p.id })}>{p.title}</button>
		{/each}
	{/each}
</div>
