<script lang="ts">
	import Icon from "$fanwit/icons/Icon.svelte";
	import { newPage, notion, type Page } from "./notion.svelte";

	/** Workspace switcher, nested page tree, new page. */
	const children = (id?: string) => notion.pages.filter((p) => p.parent === id);
</script>

{#snippet tree(p: Page, depth: number)}
	{@const kids = children(p.id)}
	<div class="group flex h-7 items-center gap-1 rounded-md pr-1 text-[13px] {notion.current === p.id ? 'bg-black/5 font-medium dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/5'}" style:padding-left="{6 + depth * 14}px">
		<button class="rounded p-0.5 opacity-50 hover:bg-black/10 {kids.length ? '' : 'invisible'}" aria-label={notion.open[p.id] ? "Collapse" : "Expand"} onclick={() => (notion.open[p.id] = !notion.open[p.id])}>
			<Icon name="chevron-right" size={12} class="transition-transform {notion.open[p.id] ? 'rotate-90' : ''}" />
		</button>
		<button class="flex min-w-0 flex-1 items-center gap-1.5 text-left" onclick={() => (notion.current = p.id)}><span>{p.icon}</span><span class="truncate">{p.title || "Untitled"}</span></button>
		<button class="rounded p-0.5 opacity-0 group-hover:opacity-60 hover:bg-black/10 focus-visible:opacity-100" aria-label="Add a page inside" title="Add a page inside" onclick={() => newPage(p.id)}><Icon name="plus" size={13} /></button>
	</div>
	{#if notion.open[p.id]}{#each kids as c (c.id)}{@render tree(c, depth + 1)}{/each}{/if}
{/snippet}

<div class="flex h-full w-full flex-col bg-[#f7f7f5] p-2 text-[#37352f] dark:bg-[#202020] dark:text-[#d4d4d4]">
	<div class="mb-3 flex items-center gap-2 px-2 py-1 text-sm font-semibold"><span class="flex size-5 items-center justify-center rounded bg-[#37352f] text-[11px] text-white dark:bg-white dark:text-black">F</span>Fanwit's workspace</div>
	<div class="mb-1 px-2 text-[11px] font-semibold opacity-50">Private</div>
	<div class="min-h-0 flex-1 overflow-auto">{#each children(undefined) as p (p.id)}{@render tree(p, 0)}{/each}</div>
	<button class="mt-2 flex h-7 items-center gap-2 rounded-md px-2 text-[13px] opacity-70 hover:bg-black/5 dark:hover:bg-white/5" onclick={() => newPage()}><Icon name="plus" size={14} />New page</button>
</div>
