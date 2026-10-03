<script lang="ts">
	import { getKernel } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import EmptyState from "../workbench/EmptyState.svelte";
	import { viewForPath } from "../core/palette";

	/** Full text search over the vault (streams results as files are scanned). */
	const k = getKernel();
	const { vault, layout } = k.sys;
	let q = $state("");
	let caseSensitive = $state(false);
	let results = $state<{ path: string; hits: { line: number; text: string }[] }[]>([]);
	let busy = $state(false);
	let seq = 0;

	async function search() {
		const id = ++seq;
		results = [];
		if (!q.trim() || !vault.current) return;
		busy = true;
		const files = (await vault.fs.list("", { recursive: true })).filter((f) => !f.dir && /\.(md|txt|toml|json|csv|js|ts|svelte|html|css)$/i.test(f.name));
		const needle = caseSensitive ? q : q.toLowerCase();
		for (const f of files) {
			if (id !== seq) return;
			const text = await vault.fs.readText(f.path).catch(() => "");
			const hits = text
				.split(/\r?\n/)
				.map((t, i) => ({ line: i + 1, text: t }))
				.filter((l) => (caseSensitive ? l.text : l.text.toLowerCase()).includes(needle))
				.slice(0, 20);
			if (hits.length) results = [...results, { path: f.path, hits }];
		}
		busy = false;
	}
	let timer: ReturnType<typeof setTimeout>;
	$effect(() => {
		void q;
		void caseSensitive;
		clearTimeout(timer);
		timer = setTimeout(search, 250);
	});
	function openAt(path: string, line: number) {
		const view = viewForPath(k, path);
		if (view) void layout.openView(view, { path }, { preview: true }).then(() => k.events.emit("editor:reveal" as never, { path, line } as never));
	}
</script>

<div class="flex h-full flex-col">
	<div class="flex items-center gap-1 p-2">
		<input class="fw-input" placeholder="Search the vault" aria-label="Search the vault" bind:value={q} />
		<button class="fw-icon-btn {caseSensitive ? 'bg-accent text-foreground' : ''}" title="Match case" aria-pressed={caseSensitive} onclick={() => (caseSensitive = !caseSensitive)}><Icon name="case-sensitive" size={15} /></button>
	</div>
	{#if !vault.current}
		<EmptyState icon="search" title="No vault open" description="Open a vault to search its files." />
	{:else}
		<div class="min-h-0 flex-1 overflow-auto pb-2 text-[12.5px]" aria-live="polite">
			{#if busy}<div class="px-3 text-xs text-muted-foreground">Searching…</div>{/if}
			{#if !busy && q && !results.length}<div class="px-3 text-xs text-muted-foreground">No results</div>{/if}
			{#each results as r (r.path)}
				<div class="px-2 pt-1 font-medium">{r.path}</div>
				{#each r.hits as h (h.line)}
					<button class="block w-full truncate px-4 py-0.5 text-left text-muted-foreground hover:bg-sidebar-accent/60" onclick={() => openAt(r.path, h.line)}><span class="mr-2 tabular-nums">{h.line}</span>{h.text.trim()}</button>
				{/each}
			{/each}
		</div>
	{/if}
</div>
