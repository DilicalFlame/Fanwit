<script lang="ts">
	import type { Snippet } from "svelte";
	import { getKernel } from "../../ui.svelte";
	import type { RegionName, RegionState } from "../../layout/model";
	import NodeView from "./NodeView.svelte";
	import Splitter from "./Splitter.svelte";
	import ActivityBar from "./ActivityBar.svelte";
	import Layers from "./Layers.svelte";
	import PaneSlot from "./PaneSlot.svelte";
	import Icon from "../../icons/Icon.svelte";

	/**
	 * The workbench frame (Section 8.3.1): fixed named regions around the split tree of the main
	 * area. Every region is optional, sized and collapsible. Responsive rules turn sidebars into
	 * drawers and the main area into single mode on narrow windows (Section 8.13).
	 */
	let { windowId = "main", titlebar, statusbar }: { windowId?: string; titlebar?: Snippet; statusbar?: Snippet } = $props();
	const k = getKernel();
	const layout = k.sys.layout;
	const win = $derived(layout.doc.window[windowId]);
	const frame = $derived(win?.frame ?? "workbench");
	const zen = $derived(!!win?.zen);
	let width = $state(1200);
	let height = $state(800);

	/** Merge responsive overrides whose breakpoint applies ("< 900px" = { sidebar = "drawer" }). */
	const responsive = $derived.by(() => {
		const out: Record<string, string> = {};
		for (const [cond, rules] of Object.entries(win?.responsive ?? {}).sort(([a], [b]) => parseInt(b.replace(/\D/g, "")) - parseInt(a.replace(/\D/g, "")))) {
			const m = /([<>]=?)\s*(\d+)px/.exec(cond);
			if (!m) continue;
			const n = Number(m[2]);
			const ok = m[1] === "<" ? width < n : m[1] === "<=" ? width <= n : m[1] === ">" ? width > n : width >= n;
			if (ok) Object.assign(out, rules);
		}
		return out;
	});

	const region = (r: RegionName): RegionState | undefined => win?.regions?.[r];
	const vis = (r: RegionName, def = true) => region(r)?.visible ?? def;
	/** Live region sizes while dragging (committed on release). */
	let live = $state<Record<string, number>>({});
	let drawerOpen = $state<Record<string, boolean>>({});

	function sizePx(r: RegionName, total: number, def: number) {
		if (live[r] !== undefined) return live[r];
		const s = region(r)?.size;
		if (typeof s === "number") return s <= 1 ? s * total : s;
		if (typeof s === "string" && s.endsWith("px")) return parseFloat(s);
		if (typeof s === "string" && s.endsWith("%")) return (parseFloat(s) / 100) * total;
		return def;
	}

	function resizeRegion(r: RegionName, delta: number, total: number, def: number, invert = false) {
		const cur = sizePx(r, total, def);
		live[r] = Math.max(120, Math.min(total - 160, cur + (invert ? -delta : delta)));
	}
	function commitRegion(r: RegionName, total: number) {
		const v = live[r];
		if (v === undefined) return;
		delete live[r];
		const s = region(r)?.size;
		const size = typeof s === "number" && s <= 1 ? Math.round((v / total) * 1000) / 1000 : `${Math.round(v)}px`;
		void layout.dispatch({ type: "setRegion", region: r, attrs: { size }, window: windowId }, { undoable: false });
	}

	const maximized = $derived(win?.maximized && layout.doc.node[win.maximized] ? win.maximized : null);
	const sidebarMode = $derived(responsive.sidebar ?? "inline");
	const inspectorMode = $derived(responsive.inspector ?? "inline");
	const single = $derived(responsive.main === "single");
	const bottomNav = $derived(responsive.activity === "bottom-nav");
	const panelSheet = $derived(responsive.panel === "sheet");
	const showActivity = $derived(!zen && vis("activity") && (region("sidebar")?.containers?.length ?? 0) > 1 && !!region("sidebar")?.node);
	const showSidebar = $derived(!zen && !!region("sidebar")?.node && vis("sidebar") && sidebarMode === "inline");
	const showInspector = $derived(!zen && !!region("inspector")?.node && vis("inspector", false) && inspectorMode === "inline");
	const showActivity2 = $derived(!zen && (region("inspector")?.containers?.length ?? 0) > 1 && vis("activity2"));
	const showPanel = $derived(!zen && !!region("panel")?.node && vis("panel", false));
	const showHeader = $derived(!zen && !!region("header")?.node && vis("header"));
	const showFooter = $derived(!!region("footer")?.node && vis("footer"));
	const showTitle = $derived(!zen && vis("titlebar"));
	const showStatus = $derived(!zen && vis("statusbar"));
</script>

<div class="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background" bind:clientWidth={width} bind:clientHeight={height} data-fw-frame={frame}>
	{#if frame !== "workbench"}
		{#if titlebar}{@render titlebar()}{/if}
		<main class="relative flex min-h-0 flex-1" data-fw-region="main" aria-label="Main area">
			{#if win?.root && layout.doc.node[win.root]}
				<NodeView node={win.root} />
			{:else if win?.root && layout.doc.pane[win.root]}
				<PaneSlot pane={win.root} />
			{:else if region("main")?.node}
				<NodeView node={region("main")!.node!} />
			{/if}
			<Layers {windowId} />
		</main>
	{:else}
		{#if showTitle && titlebar}{@render titlebar()}{/if}
		{#if showHeader}
			<header class="flex shrink-0 border-b border-border" data-fw-region="header" style:height={region("header")?.size ?? "36px"}>
				<NodeView node={region("header")!.node!} region="header" />
			</header>
		{/if}
		<div class="relative flex min-h-0 flex-1">
			{#if showActivity && !bottomNav}
				<ActivityBar region="sidebar" {windowId} ondrawer={sidebarMode === "drawer" ? (o) => (drawerOpen.sidebar = o) : undefined} />
			{/if}
			{#if showSidebar}
				<aside class="flex min-h-0 shrink-0 border-r border-sidebar-border" data-fw-region="sidebar" aria-label="Primary sidebar" style:width="{sizePx('sidebar', width, 280)}px">
					<NodeView node={region("sidebar")!.node!} region="sidebar" />
				</aside>
				<Splitter dir="row" onresize={(d) => resizeRegion("sidebar", d, width, 280)} onend={() => commitRegion("sidebar", width)} label="Resize sidebar" />
			{/if}
			<div class="flex min-h-0 min-w-0 flex-1 flex-col">
				<main class="relative flex min-h-0 flex-1" data-fw-region="main" aria-label="Main area">
					{#if maximized}
						<NodeView node={maximized} />
						<button class="fw-btn absolute right-2 bottom-2 z-20 shadow-md" onclick={() => layout.dispatch({ type: "restore", window: windowId })}><Icon name="minimize-2" size={13} /> Restore layout</button>
					{:else if region("main")?.node}
						<NodeView node={region("main")!.node!} {single} />
					{/if}
				</main>
				{#if showPanel && !panelSheet && !maximized}
					<Splitter dir="column" onresize={(d) => resizeRegion("panel", d, height, height * 0.28, true)} onend={() => commitRegion("panel", height)} label="Resize panel" />
					<section class="flex min-h-0 shrink-0 bg-panel" data-fw-region="panel" aria-label="Panel" style:height="{sizePx('panel', height, height * 0.28)}px">
						<NodeView node={region("panel")!.node!} region="panel" />
					</section>
				{/if}
			</div>
			{#if showInspector}
				<Splitter dir="row" onresize={(d) => resizeRegion("inspector", d, width, 300, true)} onend={() => commitRegion("inspector", width)} label="Resize inspector" />
				<aside class="flex min-h-0 shrink-0 border-l border-sidebar-border" data-fw-region="inspector" aria-label="Secondary sidebar" style:width="{sizePx('inspector', width, 300)}px">
					<NodeView node={region("inspector")!.node!} region="inspector" />
				</aside>
			{/if}
			{#if showActivity2}
				<ActivityBar region="inspector" {windowId} />
			{/if}

			<!-- responsive drawers and sheets -->
			{#each [["sidebar", sidebarMode], ["inspector", inspectorMode]] as [r, mode] (r)}
				{#if mode === "drawer" && region(r as RegionName)?.node && (drawerOpen[r] || (r === "inspector" && vis("inspector", false)))}
					<button class="absolute inset-0 z-40 bg-black/30" aria-label="Close {r}" onclick={() => {
						drawerOpen[r] = false;
						if (r === "inspector") void layout.dispatch({ type: "toggleRegion", region: "inspector", visible: false, window: windowId });
					}}></button>
					<aside class="absolute inset-y-0 z-50 flex w-[min(320px,85%)] border-border bg-sidebar shadow-xl {r === 'sidebar' ? 'left-0 border-r' : 'right-0 border-l'}" data-fw-region={r}>
						<NodeView node={region(r as RegionName)!.node!} region={r} />
					</aside>
				{/if}
			{/each}
			{#if showPanel && panelSheet}
				<section class="absolute inset-x-0 bottom-0 z-40 flex h-[55%] flex-col rounded-t-xl border-t border-border bg-panel shadow-2xl" data-fw-region="panel">
					<NodeView node={region("panel")!.node!} region="panel" />
				</section>
			{/if}
			<Layers {windowId} />
		</div>
		{#if showFooter}
			<footer class="flex shrink-0 border-t border-border" data-fw-region="footer" style:height={region("footer")?.size ?? "56px"}>
				<NodeView node={region("footer")!.node!} region="footer" />
			</footer>
		{/if}
		{#if bottomNav && showActivity}
			<ActivityBar region="sidebar" {windowId} orientation="horizontal" ondrawer={(o) => (drawerOpen.sidebar = o)} />
		{/if}
		{#if showStatus && statusbar}{@render statusbar()}{/if}
	{/if}
</div>
