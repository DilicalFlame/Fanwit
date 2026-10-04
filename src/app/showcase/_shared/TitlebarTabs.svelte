<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import type { TabsNode } from "$fanwit/layout/model";

	/**
	 * Tabs drawn in a title bar (Chrome, Windows Terminal) for the tab set that holds the focused
	 * pane of `view`; that tab set hides its own strip. Tabs are real panes: select, close (button
	 * or middle click), drag out to dock, split or pop out, and a new tab button.
	 */
	let { view, fallback, newCommand, tone = "light" }: { view: string; fallback: string; newCommand: string; tone?: "light" | "dark" } = $props();
	const k = getKernel();
	const layout = k.sys.layout;
	const node = $derived.by(() => {
		const d = layout.activeDocument;
		const pane = d && layout.doc.pane[d]?.view === view ? d : Object.entries(layout.doc.pane).find(([, p]) => p.view === view)?.[0];
		return Object.entries(layout.doc.node).find(([, n]) => (n as TabsNode).panes?.includes(pane ?? ""))?.[0] ?? fallback;
	});
	const tabs = $derived(layout.doc.node[node] as TabsNode | undefined);
	const icon = $derived(layout.views.get(view)?.icon ?? "file");

	const select = (p: string) => void layout.dispatch({ type: "selectPane", pane: p }, { undoable: false }).then(() => layout.focusPane(p));
	const close = (p: string) => k.commands.run("tab.close", {}, { source: "toolbar", target: { pane: p } });
	const active = (p: string) => (tabs?.active ?? tabs?.panes[0]) === p;
</script>

<div class="flex h-full min-w-0 items-end gap-0.5 overflow-hidden pt-1.5" role="tablist" aria-label="Tabs" data-tauri-drag-region>
	{#each tabs?.panes ?? [] as p (p)}
		<div
			role="tab"
			tabindex="0"
			aria-selected={active(p)}
			class="group flex h-full max-w-56 min-w-0 shrink items-center gap-2 rounded-t-lg pr-1.5 pl-3 text-xs {active(p)
				? tone === 'dark'
					? 'bg-[#2c2c2c] text-white'
					: 'bg-white text-[#1f1f1f] dark:bg-[#35363a] dark:text-white'
				: 'opacity-75 hover:bg-current/10'}"
			onpointerdown={(e) => {
				if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
				select(p);
				k.sys.dock.begin(e, p, layout.paneTitle(p));
			}}
			onauxclick={(e) => e.button === 1 && close(p)}
			onkeydown={(e) => (e.key === "Enter" || e.key === " ") && select(p)}
		>
			<Icon name={layout.doc.pane[p]?.icon ?? icon} size={13} class="shrink-0 opacity-80" />
			<span class="min-w-0 flex-1 truncate">{layout.paneTitle(p)}</span>
			<button class="rounded p-0.5 opacity-60 hover:bg-current/15 hover:opacity-100" aria-label="Close {layout.paneTitle(p)}" onclick={() => close(p)}><Icon name="x" size={12} /></button>
		</div>
	{/each}
	<button class="mb-1 ml-1 shrink-0 self-center rounded-md p-1 hover:bg-current/10" aria-label="New tab" title="New tab" onclick={() => k.commands.run(newCommand, {}, { source: "toolbar" })}><Icon name="plus" size={15} /></button>
</div>
