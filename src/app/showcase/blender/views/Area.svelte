<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import { parentOf } from "$fanwit/layout/model";
	import Viewport from "./Viewport.svelte";
	import Outliner from "./Outliner.svelte";
	import Properties from "./Properties.svelte";
	import Timeline from "./Timeline.svelte";
	import Nodes from "./Nodes.svelte";

	/**
	 * A Blender area: any editor type, picked from its own header. The choice is pane data
	 * (props.editor), so it lands in workspace.toml like the rest of the layout. Split and close
	 * are layout actions on this pane.
	 */
	let { paneId, props }: { paneId: string; props: { editor?: string } } = $props();
	const k = getKernel();
	const layout = k.sys.layout;
	const EDITORS = [
		{ id: "viewport", label: "3D Viewport", icon: "box" },
		{ id: "outliner", label: "Outliner", icon: "list-tree" },
		{ id: "properties", label: "Properties", icon: "wrench" },
		{ id: "timeline", label: "Timeline", icon: "clock" },
		{ id: "nodes", label: "Shader Editor", icon: "workflow" }
	];
	const editor = $derived(props.editor ?? "viewport");
	const current = $derived(EDITORS.find((e) => e.id === editor) ?? EDITORS[0]);
	const areas = $derived(Object.values(layout.doc.pane).filter((p) => p.view === "showcase.blender.area").length);

	const setEditor = (id: string) => layout.dispatch({ type: "setAttrs", table: "pane", id: paneId, attrs: { props: { ...props, editor: id } } });
	const split = (dir: "row" | "column") => layout.dispatch({ type: "split", node: parentOf(layout.doc, paneId)?.parent, pane: paneId, dir });
</script>

<div class="flex h-full w-full flex-col bg-[#303030] text-[12px] text-[#d4d4d4]">
	<header class="flex h-7 shrink-0 items-center gap-1 border-b border-black/40 bg-[#262626] px-1">
		<label class="relative flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10" title="Editor type">
			<Icon name={current.icon} size={14} />
			<Icon name="chevron-down" size={11} class="opacity-60" />
			<select class="absolute inset-0 cursor-pointer opacity-0" value={editor} onchange={(e) => setEditor(e.currentTarget.value)} aria-label="Editor type">
				{#each EDITORS as e (e.id)}<option value={e.id}>{e.label}</option>{/each}
			</select>
		</label>
		<span class="px-1 font-medium">{current.label}</span>
		<div class="ml-auto flex items-center">
			<button class="rounded p-1 hover:bg-white/10" title="Split vertically" aria-label="Split vertically" onclick={() => split("row")}><Icon name="columns-2" size={13} /></button>
			<button class="rounded p-1 hover:bg-white/10" title="Split horizontally" aria-label="Split horizontally" onclick={() => split("column")}><Icon name="rows-2" size={13} /></button>
			{#if areas > 1}
				<button class="rounded p-1 hover:bg-white/10" title="Close area" aria-label="Close area" onclick={() => layout.dispatch({ type: "closePane", pane: paneId })}><Icon name="x" size={13} /></button>
			{/if}
		</div>
	</header>
	<div class="relative min-h-0 flex-1">
		{#if editor === "viewport"}<Viewport />
		{:else if editor === "outliner"}<Outliner />
		{:else if editor === "properties"}<Properties />
		{:else if editor === "timeline"}<Timeline />
		{:else}<Nodes />{/if}
	</div>
</div>
