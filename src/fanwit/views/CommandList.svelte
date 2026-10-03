<script lang="ts">
	import { getKernel, menu } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import KeyChip from "../workbench/KeyChip.svelte";

	/** Browse every command by category, with bindings; click to run. */
	const k = getKernel();
	let q = $state("");
	const groups = $derived.by(() => {
		const m = new Map<string, ReturnType<typeof k.commands.list>>();
		for (const c of k.commands.list()) {
			if (c.def.palette === false) continue;
			const text = `${c.def.category ?? ""} ${c.def.title} ${c.def.id}`.toLowerCase();
			if (q && !text.includes(q.toLowerCase())) continue;
			const cat = c.def.category ?? "Other";
			m.set(cat, [...(m.get(cat) ?? []), c]);
		}
		return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
	});
	let collapsed = $state<Record<string, boolean>>({});
</script>

<div class="flex h-full flex-col">
	<div class="p-2"><input class="fw-input" placeholder="Filter commands" aria-label="Filter commands" bind:value={q} /></div>
	<div class="min-h-0 flex-1 overflow-auto pb-2 text-[12.5px]">
		{#each groups as [cat, list] (cat)}
			<button class="flex w-full items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground uppercase" onclick={() => (collapsed[cat] = !collapsed[cat])}>
				<Icon name={collapsed[cat] ? "chevron-right" : "chevron-down"} size={13} />{cat} <span class="font-normal">({list.length})</span>
			</button>
			{#if !collapsed[cat]}
				{#each list as c (c.def.id)}
					{@const enabled = k.commands.isEnabled(c.def.id)}
					<button
						class="flex w-full items-center gap-2 px-4 py-0.5 text-left hover:bg-sidebar-accent/60 {enabled ? '' : 'opacity-50'}"
						title="{c.def.id}{enabled ? '' : ' (unavailable here)'}"
						onclick={() => k.commands.run(c.def.id, {}, { source: "toolbar" }).catch((e) => k.sys.notify.error(e))}
						use:menu={{ location: "view/title", target: { command: c.def.id } }}
					>
						<Icon name={c.def.icon ?? "dot"} size={13} class="opacity-70" />
						<span class="flex-1 truncate">{k.commands.title(c.def.id)}</span>
						<KeyChip keys={k.keys.label(c.def.id)} />
					</button>
				{/each}
			{/if}
		{/each}
	</div>
</div>
