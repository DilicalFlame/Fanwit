<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import EmptyState from "../../workbench/EmptyState.svelte";
	import { manualState } from "../../manual/state.svelte";
	import { sections } from "../../manual/docs";
	import { fuzzy } from "../../workbench/fuzzy";

	/** The manual's contents for the chosen docset and kind (Manual or Reference), with a filter. */
	const k = getKernel();
	const st = manualState(k);
	let filter = $state("");
	let closed = $state<Record<string, boolean>>({});
	const current = $derived(st.activePane ? String(k.sys.layout.doc.pane[st.activePane]?.props?.page ?? st.home() ?? "") : "");
	const list = $derived(filter.trim() ? st.nav.filter((p) => fuzzy(filter.trim(), p.title) || fuzzy(filter.trim(), p.section)) : st.nav);
	const groups = $derived(sections(list));

	function open(e: MouseEvent, key: string) {
		st.open(key, { newTab: e.ctrlKey || e.metaKey || e.button === 1 });
	}
</script>

<nav class="flex h-full min-h-0 w-full flex-col bg-sidebar text-[13px]" aria-label="Manual contents">
	<div class="p-2">
		<label class="relative block">
			<Icon name="list-filter" size={13} class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground" />
			<input class="fw-input pl-7 text-xs" placeholder="Filter pages" aria-label="Filter pages" bind:value={filter} onkeydown={(e) => e.key === "Escape" && (filter = "")} />
		</label>
	</div>
	<div class="min-h-0 flex-1 overflow-auto pb-4">
		{#each groups as [section, pages] (section)}
			<button class="fw-section-title flex w-full items-center gap-1 text-left hover:text-foreground" aria-expanded={!closed[section]} onclick={() => (closed[section] = !closed[section])}>
				<Icon name={closed[section] ? "chevron-right" : "chevron-down"} size={12} />{section}
			</button>
			{#if !closed[section] || filter}
				{#each pages as p (p.key)}
					<button
						class="flex w-full items-center gap-1.5 truncate rounded-sm py-[3px] pr-3 pl-7 text-left hover:bg-sidebar-accent {current === p.key ? 'bg-sidebar-accent font-medium text-foreground' : 'text-sidebar-foreground/85'}"
						aria-current={current === p.key ? "page" : undefined}
						title={p.title}
						onclick={(e) => open(e, p.key)}
						onauxclick={(e) => open(e, p.key)}
					>
						<span class="truncate">{p.title}</span>
						{#if st.read.has(p.key)}<Icon name="check" size={12} class="ml-auto shrink-0 text-success" />{:else if p.source === "generated"}<Icon name="sparkles" size={11} class="ml-auto shrink-0 opacity-40" />{/if}
					</button>
				{/each}
			{/if}
		{:else}
			{#if filter}
				<div class="px-3 text-xs text-muted-foreground">No pages match "{filter}".</div>
			{:else}
				<EmptyState icon="book-dashed" title="Nothing here yet" description={st.kind === "reference" ? "This docset has no reference pages." : "Add Markdown pages to its docs folder."} />
			{/if}
		{/each}
		{#if st.kind === "reference" && st.apiState === "loading"}
			<div class="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground"><Icon name="loader" size={12} class="animate-spin" /> Reading the API…</div>
		{/if}
	</div>
</nav>
