<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import { navigate, openTab, toUrl } from "./browser.svelte";

	/**
	 * A mock web page for props.url: a new tab page, a search engine, a wiki, news, a shop and a
	 * home page for the framework. Links navigate this tab; Ctrl+click opens a new tab.
	 */
	let { paneId, props }: { paneId: string; props: { url?: string } } = $props();
	const k = getKernel();
	const url = $derived(props.url ?? "about:newtab");
	const host = $derived(url.split("/")[0]);
	const path = $derived(decodeURIComponent(url.split("/").slice(1).join("/")));
	let q = $state("");

	const SITES: Record<string, string> = { "wiki.example": "Wikipedia style encyclopedia", "news.example": "Headlines from nowhere", "shop.example": "Things you do not need", "fanwit.dev": "The desktop app template" };
	const WIKI: Record<string, string> = {
		Layout: "A layout arranges regions, splits, tab sets and floating panels. See Window, Tab and Workspace.",
		Window: "A window is a top level surface. Pop outs are windows that hold part of the layout. See Layout.",
		Tab: "A tab is one pane in a tab set; drag it to split, float or pop out. See Layout and Window.",
		Workspace: "A workspace is the whole layout saved as TOML. See Layout."
	};
	const NEWS = ["Local developer splits editor four ways, regrets nothing", "Study: tabs at the bottom feel like spreadsheets", "Floating panels spotted over infinite canvas", "Terminal tabs now split like tmux", "Dashboard grid achieves inner peace"];
	const PRODUCTS = [["Mechanical keyboard", 129, "#6366f1"], ["Ultrawide monitor", 499, "#0ea5e9"], ["Desk lamp", 39, "#f59e0b"], ["Cable organiser", 12, "#10b981"], ["Noise cancelling headphones", 249, "#ec4899"], ["Laptop stand", 45, "#8b5cf6"]] as const;

	function click(e: MouseEvent) {
		const a = (e.target as HTMLElement).closest<HTMLElement>("[data-url]");
		if (!a) return;
		e.preventDefault();
		if (e.ctrlKey || e.metaKey || e.button === 1) void openTab(k, a.dataset.url);
		else navigate(k, paneId, a.dataset.url!);
	}
	function search(e: Event) {
		e.preventDefault();
		if (q.trim()) navigate(k, paneId, toUrl(q));
	}
	const results = $derived.by(() => {
		const term = decodeURIComponent(url.split("q=")[1] ?? "").toLowerCase();
		const all = [...Object.entries(SITES).map(([h, d]) => [h, h, d]), ...Object.entries(WIKI).map(([t, d]) => [`wiki.example/${t}`, `${t} - Wiki`, d])];
		return { term, list: all.filter(([u, t, d]) => !term || `${u} ${t} ${d}`.toLowerCase().includes(term) || term.split(" ").some((w) => w && `${t} ${d}`.toLowerCase().includes(w))) };
	});
</script>

{#snippet link(u: string, text: string, cls = "text-blue-600 hover:underline dark:text-blue-400")}
	<a href={`#${u}`} data-url={u} class={cls}>{text}</a>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (routes clicks on the links inside, which are keyboard reachable anchors) -->
<div class="selectable h-full w-full overflow-auto bg-white text-[#202124] dark:bg-[#202124] dark:text-[#e8eaed]" onclick={click} onauxclick={click}>
	{#if url === "about:newtab"}
		<div class="mx-auto flex max-w-xl flex-col items-center gap-8 px-6 pt-24">
			<div class="text-6xl font-bold tracking-tight"><span class="text-[#4285f4]">S</span><span class="text-[#ea4335]">e</span><span class="text-[#fbbc05]">a</span><span class="text-[#4285f4]">r</span><span class="text-[#34a853]">c</span><span class="text-[#ea4335]">h</span></div>
			<form class="flex h-12 w-full items-center gap-3 rounded-full border border-black/10 px-5 shadow-sm dark:border-white/20" onsubmit={search}>
				<Icon name="search" size={18} class="opacity-50" /><input class="flex-1 bg-transparent outline-none" placeholder="Search the mock web" bind:value={q} aria-label="Search" />
			</form>
			<div class="grid grid-cols-4 gap-4">
				{#each Object.keys(SITES) as s (s)}
					<a href={`#${s}`} data-url={s} class="flex w-24 flex-col items-center gap-2 rounded-lg p-2 text-xs hover:bg-black/5 dark:hover:bg-white/10">
						<span class="flex size-12 items-center justify-center rounded-full bg-black/5 text-lg font-semibold dark:bg-white/10">{s[0].toUpperCase()}</span>{s.split(".")[0]}
					</a>
				{/each}
			</div>
		</div>
	{:else if host === "search.example"}
		<div class="max-w-2xl px-8 py-6">
			<p class="mb-4 text-sm opacity-60">{results.list.length} results for “{results.term}”</p>
			{#each results.list as [u, title, desc] (u)}
				<div class="mb-6"><div class="text-xs opacity-60">{u}</div><div class="text-xl">{@render link(u, title)}</div><p class="text-sm opacity-80">{desc}</p></div>
			{:else}<p>No results. Try “layout” or “shop”.</p>{/each}
		</div>
	{:else if host === "wiki.example"}
		{@const title = path || "Layout"}
		<div class="mx-auto max-w-3xl px-8 py-6 font-serif">
			<h1 class="mb-1 border-b border-black/10 pb-1 text-3xl dark:border-white/20">{title}</h1>
			<p class="mb-4 text-xs opacity-60">From the mock encyclopedia</p>
			<p class="mb-4 leading-relaxed">
				{#each (WIKI[title] ?? "This article does not exist yet.").split(/(Layout|Window|Tab|Workspace)/) as part, i (i)}
					{#if WIKI[part] && part !== title}{@render link(`wiki.example/${part}`, part)}{:else}{part}{/if}
				{/each}
			</p>
			<h2 class="mb-2 text-xl">See also</h2>
			<ul class="list-disc pl-6">{#each Object.keys(WIKI).filter((t) => t !== title) as t (t)}<li>{@render link(`wiki.example/${t}`, t)}</li>{/each}</ul>
		</div>
	{:else if host === "news.example"}
		<div class="mx-auto max-w-3xl px-8 py-6">
			<h1 class="mb-6 border-b-4 border-current pb-2 font-serif text-4xl font-black">The Mock Times</h1>
			{#each NEWS as n, i (n)}
				<article class="mb-5 flex gap-4 border-b border-black/10 pb-5 dark:border-white/10">
					<div class="h-20 w-32 shrink-0 rounded" style:background="linear-gradient({i * 70}deg, hsl({i * 60} 70% 60%), hsl({i * 60 + 80} 70% 40%))"></div>
					<div><h2 class="font-serif text-xl font-bold">{n}</h2><p class="text-sm opacity-70">Lorem ipsum dolor sit amet, layout consectetur adipiscing elit.</p></div>
				</article>
			{/each}
		</div>
	{:else if host === "shop.example"}
		<div class="px-8 py-6">
			<h1 class="mb-6 text-3xl font-bold">Shop</h1>
			<div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
				{#each PRODUCTS as [name, price, color] (name)}
					<div class="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
						<div class="h-28" style:background="linear-gradient(135deg, {color}, #111)"></div>
						<div class="p-3"><div class="font-medium">{name}</div><div class="text-lg font-bold">${price}</div><button class="mt-2 w-full rounded bg-[#ffd814] py-1 text-sm text-black">Add to cart</button></div>
					</div>
				{/each}
			</div>
		</div>
	{:else if host === "fanwit.dev"}
		<div class="mx-auto max-w-3xl px-8 py-16 text-center">
			<h1 class="mb-4 text-5xl font-bold">Build any desktop app</h1>
			<p class="mb-8 text-lg opacity-70">This browser, the Discord, Figma and Blender look-alikes are all one layout system. Every one of them is a TOML preset.</p>
			{@render link("wiki.example/Layout", "Read about layouts →", "rounded-full bg-blue-600 px-5 py-2.5 text-white")}
		</div>
	{:else}
		<div class="mx-auto max-w-xl px-8 pt-24">
			<Icon name="cloud-off" size={40} class="mb-4 opacity-50" />
			<h1 class="mb-2 text-2xl">This site can't be reached</h1>
			<p class="mb-4 opacity-70"><b>{host}</b> is not one of the showcase's mock sites. Try {@render link("wiki.example/Layout", "wiki.example")} or {@render link("news.example", "news.example")}.</p>
		</div>
	{/if}
</div>
