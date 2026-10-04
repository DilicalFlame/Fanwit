<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import WindowControls from "$fanwit/workbench/WindowControls.svelte";
	import { currentPage, notion } from "./notion.svelte";

	/** Notion's bar: sidebar toggle, page history, the page's breadcrumb, and page actions. */
	const k = getKernel();
	const page = $derived(currentPage());
	const crumbs = $derived.by(() => {
		const out = [];
		for (let p: typeof page | undefined = page; p; p = notion.pages.find((x) => x.id === p!.parent)) out.unshift(p);
		return out;
	});
	let back = $state<string[]>([]);
	let last = notion.current;
	$effect(() => {
		if (notion.current !== last) back = [...back, last].slice(-20);
		last = notion.current;
	});
	let starred = $state<Record<string, boolean>>({});
	const goBack = () => {
		const prev = back.at(-1);
		if (!prev) return;
		back = back.slice(0, -1);
		last = prev;
		notion.current = prev;
	};
</script>

<div class="fw-titlebar-inset flex h-full w-full items-center gap-1 bg-white text-sm text-[#37352f] dark:bg-[#191919] dark:text-[#d4d4d4]" data-tauri-drag-region>
	<button class="ml-2 rounded p-1 opacity-60 hover:bg-black/5 dark:hover:bg-white/10" aria-label="Toggle sidebar" title="Toggle sidebar" onclick={() => k.commands.run("layout.togglePrimarySidebar")}><Icon name="panel-left" size={16} /></button>
	<button class="rounded p-1 opacity-60 hover:bg-black/5 disabled:opacity-25 dark:hover:bg-white/10" aria-label="Back" disabled={!back.length} onclick={goBack}><Icon name="arrow-left" size={16} /></button>
	<nav class="ml-1 flex min-w-0 items-center gap-0.5 overflow-hidden" aria-label="Breadcrumb">
		{#each crumbs as c, i (c.id)}
			{#if i}<span class="opacity-40">/</span>{/if}
			<button class="truncate rounded px-1.5 py-0.5 hover:bg-black/5 dark:hover:bg-white/10" aria-current={c.id === page.id ? "page" : undefined} onclick={() => (notion.current = c.id)}>{c.icon} {c.title || "Untitled"}</button>
		{/each}
	</nav>
	<div class="flex-1" data-tauri-drag-region></div>
	<span class="mr-2 text-xs opacity-50" data-tauri-drag-region>Edited just now</span>
	<button class="rounded px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10" onclick={() => k.sys.notify.toast("Shared with the workspace (it's a showcase)", "success")}>Share</button>
	<button class="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10" aria-label="Favourite" aria-pressed={!!starred[page.id]} onclick={() => (starred[page.id] = !starred[page.id])}><Icon name="star" size={16} class={starred[page.id] ? "fill-yellow-400 text-yellow-500" : "opacity-60"} /></button>
	<button class="mr-1 rounded p-1 opacity-60 hover:bg-black/5 dark:hover:bg-white/10" aria-label="More"><Icon name="ellipsis" size={16} /></button>
	<WindowControls />
</div>
