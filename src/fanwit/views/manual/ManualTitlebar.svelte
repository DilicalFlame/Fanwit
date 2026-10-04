<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import WindowControls from "../../workbench/WindowControls.svelte";
	import { manualState } from "../../manual/state.svelte";
	import { docsets } from "../../manual/docs";
	import SearchBox from "./SearchBox.svelte";
	import { base } from "$app/paths";
	import { siteVersion } from "virtual:fw-docs";

	/**
	 * The Manual's title bar: docset chips, the level switch (Beginner, Intermediate, Expert, or
	 * Manual for a docset without levels, then Reference: what the navigation shows),
	 * the unified search, the version, reading settings and the outline toggle.
	 */
	const k = getKernel();
	const st = manualState(k);
	let width = $state(1200);
	const narrow = $derived(width < 760);
	$effect(() => void st.loadVersions(base));
	const levels = $derived(st.docset?.levels ?? []);
	const choices = $derived([...(levels.length ? levels.map((l) => [l.id, l.title, l.summary ?? ""]) : [["manual", "Manual", ""]]), ["reference", "Reference", "Every command, setting, API and file format"]]);
	const chosen = $derived(st.kind === "reference" ? "reference" : levels.length ? st.activeLevel : "manual");
	function choose(id: string) {
		if (id === "reference") st.kind = "reference";
		else if (id === "manual") st.kind = "manual";
		else st.setLevel(id);
	}

	// narrow windows hide the side regions (manual.toml); these open them as drawers instead
	function contents() {
		void k.sys.layout.dispatch({ type: "openDrawer", view: "manual.nav", side: "left", size: "300px" });
	}
	function outline() {
		if (width < 1100) return void k.sys.layout.dispatch({ type: "openDrawer", view: "manual.outline", side: "right", size: "280px" });
		const v = k.sys.layout.doc.window.main?.regions?.inspector?.visible;
		void k.sys.layout.dispatch({ type: "toggleRegion", region: "inspector", visible: v === false });
	}
</script>

<div class="fw-titlebar-inset flex h-full w-full items-center gap-2 bg-titlebar px-2 text-titlebar-foreground" data-tauri-drag-region bind:clientWidth={width}>
	{#if narrow}
		<button class="fw-icon-btn" aria-label="Contents" title="Contents" onclick={contents}><Icon name="menu" size={15} /></button>
	{:else}
		<Icon name={st.docset?.icon ?? "book-open"} size={16} class="ml-1 text-muted-foreground" />
	{/if}
	{#if docsets.length > 1 && !narrow}
		<div class="flex rounded-md border border-border p-0.5 text-xs" role="radiogroup" aria-label="Documentation set">
			{#each docsets as s (s.id)}
				<button class="rounded px-2 py-0.5 {st.set === s.id ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}" role="radio" aria-checked={st.set === s.id} onclick={() => (st.set = s.id)}>{s.title}</button>
			{/each}
		</div>
	{/if}
	{#if narrow}
		<select class="rounded-full border border-border bg-muted px-2 py-0.5 text-xs" aria-label={levels.length ? "Level" : "Manual or reference"} value={chosen} onchange={(e) => choose(e.currentTarget.value)}>
			{#each choices as [id, label] (id)}<option value={id}>{label}</option>{/each}
		</select>
	{:else}
		<div class="flex shrink-0 rounded-full bg-muted p-0.5 text-xs" role="radiogroup" aria-label={levels.length ? "Level" : "Manual or reference"}>
			{#each choices as [id, label, hint] (id)}
				<button class="rounded-full px-3 py-0.5 transition-colors {chosen === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}" role="radio" aria-checked={chosen === id} title={hint || undefined} onclick={() => choose(id)}>{label}</button>
			{/each}
		</div>
	{/if}
	<div class="flex min-w-0 flex-1 justify-center" data-tauri-drag-region><SearchBox /></div>
	{#if st.versions && !narrow}
		<select class="rounded border border-border bg-transparent px-1 font-mono text-[11px] text-muted-foreground" aria-label="Documentation version" value={siteVersion} onchange={(e) => st.switchVersion(e.currentTarget.value)}>
			{#each st.versions.versions as v (v)}<option value={v}>{v === "next" ? "next (unreleased)" : `v${v}`}{v === st.versions.latest ? " (latest)" : ""}</option>{/each}
		</select>
	{:else if st.docset && !narrow}
		<span class="rounded border border-border px-1.5 font-mono text-[11px] text-muted-foreground" title="{st.docset.title} documentation version">v{st.docset.version}</span>
	{/if}
	<button class="fw-icon-btn" data-manual-reading aria-label="Reading settings" title="Reading settings" onclick={() => k.commands.run("manual.readingSettings")}><Icon name="a-large-small" size={16} /></button>
	<button class="fw-icon-btn" aria-label="On this page" title="On this page" onclick={outline}><Icon name="list" size={15} /></button>
	<WindowControls />
</div>
