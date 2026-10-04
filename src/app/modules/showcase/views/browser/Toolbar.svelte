<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import { activePage, browser, canGo, go, navigate, NEW_TAB, toUrl } from "./browser.svelte";

	/** Back, forward, reload, the address bar, bookmark star, new tab, and the bookmarks bar. */
	const k = getKernel();
	const page = $derived(activePage(k));
	const url = $derived(page ? String(k.sys.layout.doc.pane[page]?.props?.url ?? NEW_TAB) : "");
	let draft = $state("");
	let typing = $state(false);
	let reloading = $state(false);
	const starred = $derived(browser.bookmarks.includes(url));

	function submit(e: Event) {
		e.preventDefault();
		if (page) navigate(k, page, toUrl(draft));
		typing = false;
		(document.activeElement as HTMLElement | null)?.blur();
	}
	function reload() {
		reloading = true;
		setTimeout(() => (reloading = false), 500);
	}
</script>

<div class="flex h-full w-full flex-col justify-center gap-1 bg-tab px-2 text-sm">
	<div class="flex items-center gap-1">
		<button class="fw-icon-btn" aria-label="Back" disabled={!canGo(page, -1)} onclick={() => page && go(k, page, -1)}><Icon name="arrow-left" size={16} /></button>
		<button class="fw-icon-btn" aria-label="Forward" disabled={!canGo(page, 1)} onclick={() => page && go(k, page, 1)}><Icon name="arrow-right" size={16} /></button>
		<button class="fw-icon-btn" aria-label="Reload" onclick={reload}><Icon name="rotate-cw" size={15} class={reloading ? "animate-spin" : ""} /></button>
		<form class="mx-1 flex h-8 flex-1 items-center gap-2 rounded-full bg-muted px-3 focus-within:ring-2 focus-within:ring-ring" onsubmit={submit}>
			<Icon name={url.startsWith("about:") || url.startsWith("search.") ? "search" : "lock"} size={13} class="opacity-60" />
			<input
				class="min-w-0 flex-1 bg-transparent outline-none"
				aria-label="Address"
				placeholder="Search or type a URL"
				value={typing ? draft : url === NEW_TAB ? "" : url}
				onfocus={(e) => {
					draft = url === NEW_TAB ? "" : url;
					typing = true;
					queueMicrotask(() => e.currentTarget.select());
				}}
				oninput={(e) => (draft = e.currentTarget.value)}
				onblur={() => (typing = false)}
			/>
			<button type="button" aria-label={starred ? "Remove bookmark" : "Bookmark this page"} disabled={!url || url === NEW_TAB} onclick={() => (browser.bookmarks = starred ? browser.bookmarks.filter((b) => b !== url) : [...browser.bookmarks, url])}>
				<Icon name="star" size={15} class={starred ? "fill-yellow-400 text-yellow-500" : "opacity-60"} />
			</button>
		</form>
		<button class="fw-icon-btn" aria-label="New tab" title="New tab" onclick={() => k.commands.run("showcase.browser.newTab", {}, { source: "toolbar" })}><Icon name="plus" size={16} /></button>
	</div>
	<div class="flex items-center gap-1 overflow-hidden text-xs">
		{#each browser.bookmarks as b (b)}
			<button class="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 hover:bg-accent" onclick={(e) => (e.ctrlKey || e.metaKey ? k.commands.run("showcase.browser.newTab", { url: b }) : page && navigate(k, page, b))}>
				<Icon name="globe" size={12} class="opacity-60" />{b.split("/")[0]}
			</button>
		{/each}
	</div>
</div>
