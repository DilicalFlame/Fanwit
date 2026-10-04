<script lang="ts">
	import { untrack } from "svelte";
	import { parse } from "smol-toml";
	import { getKernel } from "../../ui.svelte";
	import type { LayoutDoc, LayoutNode, RegionState } from "../../layout/model";

	/**
	 * A layout as a miniature window: `<LayoutPreview preset="vscode" />`, or `toml={...}` for an
	 * inline document. It draws what the TOML says (regions, splits, tab sets, panes), so a reader
	 * can see how the document and the window correspond. `editable` adds the TOML beside it,
	 * redrawn as you type. Hover a box to see its node or pane.
	 */
	let { preset, toml, editable = false, showToml = false, height = 300 }: { preset?: string; toml?: string; editable?: boolean; showToml?: boolean; height?: number } = $props();
	const k = getKernel();
	// the props seed a local copy the reader can edit
	let text = $state(untrack(() => toml ?? (preset ? k.sys.layout.presets.get(preset)?.text : undefined) ?? "").replace(/^#[^\n]*\n/gm, "").trim());
	let tomlOpen = $state(untrack(() => showToml || editable));
	let hover = $state("");
	let selected = $state("");

	const parsed = $derived.by((): { doc?: LayoutDoc; error?: string } => {
		try {
			return { doc: parse(text) as unknown as LayoutDoc };
		} catch (e) {
			return { error: (e as Error).message.split("\n")[0] };
		}
	});
	const doc = $derived(parsed.doc);
	const win = $derived(doc?.window?.main ?? Object.values(doc?.window ?? {})[0]);
	const R = (r: string): RegionState | undefined => win?.regions?.[r as keyof typeof win.regions];
	const vis = (r: string, def = true) => R(r)?.visible ?? def;
	const has = (r: string, def = true) => !!R(r)?.node && vis(r, def);
	/** "280px" of a 1280 x 800 window, a fraction, or a weight. */
	const basis = (s: unknown, total: number, def: string) => (typeof s === "string" && s.endsWith("px") ? `${(parseFloat(s) / total) * 100}%` : typeof s === "number" && s <= 1 ? `${s * 100}%` : def);
	const paneLabel = (id: string) => {
		const p = doc?.pane?.[id];
		return p?.title ?? p?.view?.split(".").pop() ?? id;
	};
	const lines = $derived(text.split("\n"));
	/** Line of `[pane.x]` / `[node.x]` in the TOML, to highlight what you clicked. */
	const lineOf = (id: string) => lines.findIndex((l) => l.trim() === `[${id}]`);
	/** Lines of the selected table: its header up to the next one. */
	const hit = $derived.by(() => {
		const s = selected ? lineOf(selected) : -1;
		if (s < 0) return [-1, -1];
		const e = lines.findIndex((x, j) => j > s && x.trim().startsWith("["));
		return [s, e < 0 ? lines.length : e];
	});
	const describe = (id: string) => {
		if (id.startsWith("pane.")) {
			const p = doc?.pane?.[id.slice(5)];
			return `${id}: view ${p?.view}${p?.props ? ` with props ${JSON.stringify(p.props)}` : ""}`;
		}
		const n = doc?.node?.[id.slice(5)] as (LayoutNode & { panes?: string[]; children?: string[]; dir?: string }) | undefined;
		return n ? `${id}: ${n.type}${n.dir ? ` (${n.dir})` : ""}${n.panes ? `, panes ${n.panes.join(", ")}` : ""}${n.children ? `, children ${n.children.join(", ")}` : ""}` : id;
	};
	const pick = (id: string) => (selected = selected === id ? "" : id);
</script>

{#snippet node(id: string)}
	{@const n = doc?.node?.[id] as (LayoutNode & { panes?: string[]; children?: string[]; sizes?: (number | string)[]; dir?: string; active?: string; strip?: string; title?: string }) | undefined}
	{#if !n && doc?.pane?.[id]}
		{@render pane(id)}
	{:else if n?.type === "split"}
		<div class="fw-lp-split" class:col={n.dir === "column"} data-hover={hover === `node.${id}` || undefined} onpointerenter={() => (hover = `node.${id}`)} role="presentation">
			{#each n.children ?? [] as c, i (c)}
				{@const s = n.sizes?.[i]}
				<div class="fw-lp-cell" style:flex={typeof s === "number" && s > 1 ? `${s} 1 0` : basis(s, n.dir === "column" ? 800 : 1280, "") ? `0 0 ${basis(s, n.dir === "column" ? 800 : 1280, "")}` : "1 1 0"}>{@render node(c)}</div>
			{/each}
		</div>
	{:else if n?.type === "tabs" || n?.type === "stack"}
		{@const active = n.active ?? n.panes?.[0]}
		<button type="button" class="fw-lp-tabs" class:sel={selected === `node.${id}`} data-hover={hover === `node.${id}` || undefined} onpointerenter={() => (hover = `node.${id}`)} onclick={(e) => (e.stopPropagation(), pick(`node.${id}`))}>
			{#if n.type === "stack"}
				{#each n.panes ?? [] as p (p)}<span class="fw-lp-stackhead">{paneLabel(p)}</span><span class="fw-lp-body">{@render pane(p)}</span>{/each}
			{:else}
				{#if n.strip !== "hidden"}
					<span class="fw-lp-strip" class:bottom={n.strip === "bottom"}>{#each n.panes ?? [] as p (p)}<span class="fw-lp-tab" class:on={p === active}>{paneLabel(p)}</span>{/each}</span>
				{/if}
				<span class="fw-lp-body">{#if active}{@render pane(active)}{/if}</span>
			{/if}
		</button>
	{:else if n}
		<span class="fw-lp-pane"><span>{n.type}</span></span>
	{/if}
{/snippet}

{#snippet pane(id: string)}
	<span class="fw-lp-pane" class:sel={selected === `pane.${id}`} data-hover={hover === `pane.${id}` || undefined} onpointerenter={(e) => (e.stopPropagation(), (hover = `pane.${id}`))} onclick={(e) => (e.stopPropagation(), pick(`pane.${id}`))} role="presentation">
		<span>{doc?.pane?.[id]?.view ?? id}</span>
	</span>
{/snippet}

{#snippet region(r: string, cls: string, size: string)}
	<div class="fw-lp-region {cls}" style:flex-basis={size} data-region={r} title={r}>{@render node(R(r)!.node!)}</div>
{/snippet}

<div class="fw-lp fw-widget">
	<div class="fw-lp-window" style:height="{height}px" onpointerleave={() => (hover = "")} role="img" aria-label="Preview of the {doc?.preset ?? preset ?? ''} layout">
		{#if !doc}
			<div class="fw-lp-error">{parsed.error ?? "Empty layout"}</div>
		{:else}
			{#if vis("titlebar")}
				<div class="fw-lp-titlebar">{#if R("titlebar")?.node}{@render node(R("titlebar")!.node!)}{:else}<span class="fw-lp-dots"></span><span>{doc.preset ?? "window"}</span>{/if}</div>
			{/if}
			{#if has("header")}{@render region("header", "fw-lp-header", "")}{/if}
			<div class="fw-lp-middle">
				{#if vis("activity") && (R("sidebar")?.containers?.length ?? 0) > 1}<div class="fw-lp-activity" title="activity bar">{#each R("sidebar")!.containers! as _c, i (i)}<i></i>{/each}</div>{/if}
				{#if has("sidebar")}{@render region("sidebar", "fw-lp-side", basis(R("sidebar")?.size, 1280, "22%"))}{/if}
				<div class="fw-lp-center">
					{#if R("main")?.node}<div class="fw-lp-region fw-lp-main" data-region="main">{@render node(R("main")!.node!)}</div>{/if}
					{#if has("panel", false)}{@render region("panel", "fw-lp-panel", basis(R("panel")?.size, 800, "28%"))}{/if}
				</div>
				{#if has("inspector", false)}{@render region("inspector", "fw-lp-side right", basis(R("inspector")?.size, 1280, "22%"))}{/if}
			</div>
			{#if has("footer")}{@render region("footer", "fw-lp-header", "")}{/if}
			{#if vis("statusbar")}<div class="fw-lp-status"></div>{/if}
		{/if}
	</div>
	<div class="fw-lp-caption">
		<span class="fw-lp-info">{hover ? describe(hover) : selected ? describe(selected) : "Hover a box to see its node or pane; click to find it in the TOML."}</span>
		<button type="button" class="fw-lp-toggle" onclick={() => (tomlOpen = !tomlOpen)}>{tomlOpen ? "Hide" : "Show"} TOML</button>
	</div>
	{#if tomlOpen}
		{#if editable}
			<textarea class="fw-lp-toml" bind:value={text} spellcheck="false" aria-label="Layout TOML (edit to redraw)" style:height="{height}px"></textarea>
		{:else}
			<pre class="fw-lp-toml" style:max-height="{height}px"><code>{#each lines as l, i (i)}<span class:hit={i >= hit[0] && i < hit[1]}>{l}{"\n"}</span>{/each}</code></pre>
		{/if}
	{/if}
</div>
