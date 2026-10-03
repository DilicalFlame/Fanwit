<script lang="ts">
	import { getKernel } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import { pages, sections, textOf, type DocPage } from "../manual/docs";
	import { frontMatter, render, type Heading } from "../manual/markdown";

	/**
	 * Manual window (Figure 17.15): navigation and full text search, Markdown content with runnable
	 * examples that execute real commands, and an "On this page" outline with scroll spy.
	 */
	let { props }: { props: { page?: string; search?: string } } = $props();
	const k = getKernel();
	let list = $state<DocPage[]>([]);
	let current = $state(props.page?.replace(/^manual:\/\//, "") ?? "");
	let html = $state("");
	let headings = $state<Heading[]>([]);
	let query = $state(props.search ?? "");
	let activeHeading = $state("");
	let content = $state<HTMLElement>();

	$effect(() => {
		void pages(k).then((l) => {
			list = l;
			if (!current || !l.some((p) => p.id === current.split("#")[0])) current = l[0]?.id ?? "";
		});
	});
	$effect(() => {
		const [id, anchor] = current.split("#");
		const p = list.find((x) => x.id === id) ?? list.find((x) => x.id.endsWith(id));
		if (!p) return;
		void p.load().then((md) => {
			const r = render(frontMatter(md).body);
			html = r.html;
			headings = r.headings;
			queueMicrotask(() => (anchor ? content?.querySelector(`#${CSS.escape(anchor)}`)?.scrollIntoView() : content?.scrollTo(0, 0)));
		});
	});
	const results = $derived(
		query.trim()
			? list
					.map((p) => {
						const t = (textOf(p.id) || "").toLowerCase();
						const q = query.toLowerCase();
						const i = t.indexOf(q);
						return { p, i, title: p.title.toLowerCase().includes(q) };
					})
					.filter((r) => r.i >= 0 || r.title)
					.map((r) => ({ ...r, excerpt: r.i >= 0 ? textOf(r.p.id).slice(Math.max(0, r.i - 40), r.i + 80).replace(/\s+/g, " ") : "" }))
			: []
	);

	async function click(e: MouseEvent) {
		const t = e.target as HTMLElement;
		const run = t.closest("[data-run]") as HTMLElement | null;
		if (run) {
			let args = {};
			try {
				args = JSON.parse(run.dataset.args || "{}");
			} catch {
				/* plain text args */
			}
			try {
				const r = await k.commands.run(run.dataset.run!, args, { source: "api", interactive: true });
				k.sys.notify.toast(r === undefined ? `Ran ${run.dataset.run}` : `${run.dataset.run} → ${JSON.stringify(r)}`, "success");
			} catch (err) {
				k.sys.notify.error(err);
			}
			return;
		}
		const a = t.closest("a[data-href]") as HTMLAnchorElement | null;
		if (!a) return;
		e.preventDefault();
		const href = a.dataset.href!;
		if (href.startsWith("manual://")) current = href.slice(9);
		else if (href.startsWith("#")) content?.querySelector(href)?.scrollIntoView();
		else void k.commands.run("shell.openExternal", { url: href });
	}
	function spy() {
		if (!content) return;
		const hs = [...content.querySelectorAll("h2, h3")] as HTMLElement[];
		const top = content.getBoundingClientRect().top + 40;
		activeHeading = hs.filter((h) => h.getBoundingClientRect().top <= top).at(-1)?.id ?? hs[0]?.id ?? "";
	}
</script>

<div class="flex h-full min-h-0 text-[13px]">
	<nav class="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar" aria-label="Manual">
		<div class="relative p-2">
			<Icon name="search" size={13} class="absolute top-4 left-4 text-muted-foreground" />
			<input class="fw-input pl-7 text-xs" placeholder="Search docs" aria-label="Search docs" bind:value={query} />
		</div>
		<div class="min-h-0 flex-1 overflow-auto pb-3">
			{#if query.trim()}
				{#each results as r (r.p.id)}
					<button class="block w-full px-3 py-1 text-left hover:bg-sidebar-accent" onclick={() => { current = r.p.id; query = ""; }}>
						<div class="font-medium">{r.p.title}</div>{#if r.excerpt}<div class="truncate text-[11px] text-muted-foreground">…{r.excerpt}…</div>{/if}
					</button>
				{:else}<div class="px-3 text-xs text-muted-foreground">No pages match.</div>{/each}
			{:else}
				{#each sections(list) as [section, ps] (section)}
					<div class="fw-section-title">{section}</div>
					{#each ps as p (p.id)}
						<button class="block w-full truncate px-4 py-0.5 text-left hover:bg-sidebar-accent {current.split('#')[0] === p.id ? 'bg-sidebar-accent font-medium' : ''}" onclick={() => (current = p.id)}>{p.title}</button>
					{/each}
				{/each}
			{/if}
		</div>
	</nav>
	<article bind:this={content} class="fw-prose selectable min-w-0 flex-1 overflow-auto px-10 py-6" onclick={click} onkeydown={() => {}} onscroll={spy} role="presentation">
		{@html html}
	</article>
	{#if headings.length > 2}
		<aside class="hidden w-48 shrink-0 overflow-auto p-4 text-xs lg:block" aria-label="On this page">
			<div class="fw-section-title px-0">On this page</div>
			{#each headings.filter((h) => h.level > 1 && h.level < 4) as h (h.id)}
				<button class="block w-full truncate py-0.5 text-left {activeHeading === h.id ? 'font-medium text-foreground' : 'text-muted-foreground'}" style:padding-left="{(h.level - 2) * 10}px" onclick={() => content?.querySelector(`#${CSS.escape(h.id)}`)?.scrollIntoView({ behavior: "smooth" })}>{h.text}</button>
			{/each}
		</aside>
	{/if}
</div>
