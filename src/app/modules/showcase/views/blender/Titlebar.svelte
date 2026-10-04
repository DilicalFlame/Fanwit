<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import MenuBar from "$fanwit/workbench/MenuBar.svelte";
	import WindowControls from "$fanwit/workbench/WindowControls.svelte";

	/**
	 * Blender's top bar: menus, then the workspace tabs. A workspace is a preset for the big area:
	 * Shading turns it into the Shader Editor, the others into the 3D Viewport.
	 */
	const k = getKernel();
	const layout = k.sys.layout;
	const WORKSPACES = ["Layout", "Modeling", "Sculpting", "UV Editing", "Texture Paint", "Shading", "Animation", "Rendering"];
	let active = $state("Layout");

	function pick(ws: string) {
		active = ws;
		const [id, pane] = Object.entries(layout.doc.pane).find(([, p]) => p.view === "showcase.blender.area" && (p.props?.editor === "viewport" || p.props?.editor === "nodes")) ?? [];
		if (id) void layout.dispatch({ type: "setAttrs", table: "pane", id, attrs: { props: { ...pane!.props, editor: ws === "Shading" ? "nodes" : "viewport" } } });
	}
</script>

<div class="fw-titlebar-inset flex h-full w-full items-center gap-1 bg-[#1d1d1d] text-xs text-[#cfcfcf]" data-tauri-drag-region>
	<div class="flex items-center pl-1"><MenuBar icon="orbit" /></div>
	<div class="ml-2 flex min-w-0 items-center gap-0.5 overflow-hidden" role="tablist" aria-label="Workspaces">
		{#each WORKSPACES as ws (ws)}
			<button role="tab" aria-selected={active === ws} class="shrink-0 rounded px-2.5 py-1 {active === ws ? 'bg-[#303030] text-white' : 'hover:bg-white/5'}" onclick={() => pick(ws)}>{ws}</button>
		{/each}
	</div>
	<div class="flex-1" data-tauri-drag-region></div>
	<div class="flex items-center gap-1 pr-2">
		<span class="rounded bg-[#2b2b2b] px-2 py-0.5">Scene</span>
		<span class="rounded bg-[#2b2b2b] px-2 py-0.5">ViewLayer</span>
	</div>
	<WindowControls />
</div>
