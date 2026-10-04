<script lang="ts">
	import { getKernel } from "../ui.svelte";
	import { manualState } from "../manual/state.svelte";
	import { ordered, sections } from "../manual/docs";

	/** Manual contents in the main window's sidebar; pages open in the Manual window. */
	const k = getKernel();
	const st = manualState(k);
	const list = $derived(ordered(st.pages.filter((p) => p.set === st.set && p.kind === "manual"), st.docset));
</script>

<div class="h-full overflow-auto pb-3 text-[13px]">
	{#each sections(list) as [section, ps] (section)}
		<div class="fw-section-title">{section}</div>
		{#each ps as p (p.key)}
			<button class="block w-full truncate px-4 py-0.5 text-left hover:bg-sidebar-accent" onclick={() => k.commands.run("manual.open", { page: p.key })}>{p.title}</button>
		{/each}
	{:else}
		<div class="px-3 py-2 text-xs text-muted-foreground">No manual pages in this build.</div>
	{/each}
	<button class="fw-btn fw-btn-ghost mx-2 mt-2" onclick={() => k.commands.run("manual.open")}>Open the Manual window</button>
</div>
