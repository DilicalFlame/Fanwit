<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import { manualState } from "../../manual/state.svelte";
	import { search, parseQuery, MODES, type Hit } from "../../manual/search";

	/**
	 * Unified search: pages, sections, API, commands, settings and errors in one box. A prefix
	 * (/ # @ > : !) or a chip narrows it to one kind; results stay within the docset unless
	 * "All docsets" is on. Enter opens, Ctrl+Enter opens in a new tab.
	 */
	const k = getKernel();
	const st = manualState(k);
	let input = $state<HTMLInputElement>();
	let query = $state("");
	let open = $state(false);
	let everywhere = $state(false);
	let hits = $state.raw<Hit[]>([]);
	let sel = $state(0);
	let busy = $state(false);
	let rect = $state({ left: 0, top: 0, width: 0 });
	const RECENT = "fw-manual-recent";
	let recent = $state<string[]>(read());
	function read(): string[] {
		try {
			return JSON.parse(localStorage.getItem(RECENT) ?? "[]");
		} catch {
			return [];
		}
	}
	function remember(q: string) {
		recent = [q, ...recent.filter((r) => r !== q)].slice(0, 8);
		try {
			localStorage.setItem(RECENT, JSON.stringify(recent));
		} catch {
			/* storage unavailable */
		}
	}

	const mode = $derived(parseQuery(query).type);
	const groups = $derived(MODES.map((m) => ({ ...m, hits: hits.filter((h) => h.type === m.type) })).filter((g) => g.hits.length));
	const flat = $derived(groups.flatMap((g) => g.hits));

	let seq = 0;
	$effect(() => {
		const q = query;
		const scope = everywhere ? undefined : st.set;
		const n = ++seq;
		if (!parseQuery(q).q) {
			hits = [];
			return;
		}
		busy = true;
		const t = setTimeout(async () => {
			const r = await search(st, q, { set: scope }).catch(() => []);
			if (n !== seq) return;
			hits = r;
			sel = 0;
			busy = false;
		}, 70);
		return () => clearTimeout(t);
	});
	$effect(() => {
		const r = st.searchRequest;
		if (!r) return;
		query = r.query;
		input?.focus();
		show();
	});

	function show() {
		if (input) {
			const b = input.getBoundingClientRect();
			rect = { left: b.left, top: b.bottom + 6, width: Math.max(b.width, Math.min(560, innerWidth - b.left - 12)) };
		}
		open = true;
	}
	function choose(h: Hit, newTab = false) {
		const q = parseQuery(query).q;
		if (q) remember(query);
		open = false;
		input?.blur();
		if (h.run) return void h.run();
		if (h.page) st.open(h.page, { newTab, terms: h.type === "page" || h.type === "section" ? q.split(/\s+/) : [] });
	}
	function setMode(prefix: string) {
		const q = parseQuery(query).q;
		query = prefix + q;
		input?.focus();
	}
	function key(e: KeyboardEvent) {
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			if (!open) show();
			const n = flat.length || 1;
			sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
			document.getElementById(`fw-hit-${sel}`)?.scrollIntoView({ block: "nearest" });
		} else if (e.key === "Enter") {
			const h = flat[sel];
			if (h) choose(h, e.ctrlKey || e.metaKey);
		} else if (e.key === "Escape") {
			if (open && query) query = "";
			else {
				open = false;
				input?.blur();
			}
		}
	}
	/** Bold the matched characters. */
	const marks = (text: string, pos?: number[]) => {
		const set = new Set(pos ?? []);
		return [...text].map((c, i) => ({ c, on: set.has(i) }));
	};
</script>

<div class="relative flex h-7 w-full max-w-[520px] min-w-0 items-center">
	<Icon name="search" size={14} class="pointer-events-none absolute left-2.5 text-muted-foreground" />
	<input
		bind:this={input}
		bind:value={query}
		class="h-full w-full rounded-md border border-border bg-background pr-14 pl-8 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
		placeholder="Search the docs"
		aria-label="Search the docs"
		role="combobox"
		aria-expanded={open}
		aria-controls="fw-manual-results"
		aria-activedescendant={open && flat.length ? `fw-hit-${sel}` : undefined}
		autocomplete="off"
		spellcheck="false"
		onfocus={show}
		oninput={show}
		onkeydown={key}
		onblur={() => setTimeout(() => (open = false), 150)}
	/>
	<kbd class="pointer-events-none absolute right-2 rounded border border-border px-1 font-sans text-[10px] text-muted-foreground">{k.keys.label("manual.focusSearch")?.join(" ") ?? "/"}</kbd>
</div>

{#if open}
	<div
		id="fw-manual-results"
		class="fixed z-50 flex max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-lg border border-border bg-popover text-[13px] text-popover-foreground shadow-xl"
		style:left="{rect.left}px"
		style:top="{rect.top}px"
		style:width="{rect.width}px"
		role="listbox"
		aria-label="Search results"
		tabindex="-1"
		onmousedown={(e) => e.preventDefault()}
	>
		<div class="flex flex-wrap items-center gap-1 border-b border-border p-2">
			<button class="rounded-full px-2 py-0.5 text-xs {!mode ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}" onclick={() => setMode("")}>All</button>
			{#each MODES as m (m.prefix)}
				<button class="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs {mode === m.type ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}" title="Type {m.prefix} to search {m.label.toLowerCase()} only" onclick={() => setMode(m.prefix)}>
					<span class="font-mono opacity-60">{m.prefix}</span>{m.label}
				</button>
			{/each}
			<label class="ml-auto flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" bind:checked={everywhere} /> All docsets</label>
		</div>
		<div class="min-h-0 flex-1 overflow-auto py-1">
			{#if !parseQuery(query).q}
				{#if recent.length}
					<div class="fw-section-title">Recent</div>
					{#each recent as r (r)}
						<button class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent" onclick={() => (query = r)}><Icon name="history" size={13} class="text-muted-foreground" />{r}</button>
					{/each}
				{:else}
					<p class="px-3 py-2 text-xs text-muted-foreground">Search pages, sections, the API, commands, settings and error codes. Start with a prefix to search one kind.</p>
				{/if}
			{:else if busy && !flat.length}
				<p class="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
			{:else if !flat.length}
				<p class="px-3 py-2 text-xs text-muted-foreground">Nothing found for "{parseQuery(query).q}".{#if !everywhere} <button class="underline" onclick={() => (everywhere = true)}>Search all docsets</button>{/if}</p>
			{:else}
				{#each groups as g (g.type)}
					<div class="fw-section-title flex items-center gap-1"><Icon name={g.icon} size={11} />{g.label}</div>
					{#each g.hits as h (h.id)}
						{@const i = flat.indexOf(h)}
						<button
							id="fw-hit-{i}"
							role="option"
							aria-selected={i === sel}
							class="flex w-full flex-col px-3 py-1.5 text-left {i === sel ? 'bg-accent' : ''}"
							onmousemove={() => (sel = i)}
							onclick={(e) => choose(h, e.ctrlKey || e.metaKey)}
						>
							<span class="flex w-full items-baseline gap-2">
								<span class="truncate">{#each marks(h.title, h.positions) as m, j (j)}{#if m.on}<b class="text-primary">{m.c}</b>{:else}{m.c}{/if}{/each}</span>
								{#if h.context}<span class="ml-auto shrink-0 truncate text-xs text-muted-foreground">{h.context}</span>{/if}
							</span>
							{#if h.detail}<span class="truncate font-mono text-[11px] text-muted-foreground">{h.detail}</span>{/if}
						</button>
					{/each}
				{/each}
			{/if}
		</div>
		<div class="flex gap-3 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
			<span>↑↓ choose</span><span>Enter open</span><span>Ctrl+Enter new tab</span><span>Esc close</span>
		</div>
	</div>
{/if}
