<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import WindowControls from "$fanwit/workbench/WindowControls.svelte";
	import { activeNote } from "./obsidian.svelte";

	/** Obsidian's slim bar: sidebar toggles at the edges and the focused note's name in the middle. */
	const k = getKernel();
	const note = $derived(activeNote(k));
	const regions = $derived(k.sys.layout.doc.window[k.sys.layout.windowId]?.regions);
</script>

<div class="fw-titlebar-inset flex h-full w-full items-center bg-[#f6f6f6] text-xs text-[#5c5c5c] dark:bg-[#262626] dark:text-[#bababa]" data-tauri-drag-region>
	<button class="ml-2 rounded p-1 hover:bg-black/5 dark:hover:bg-white/10" aria-label="Toggle left sidebar" aria-pressed={regions?.sidebar?.visible ?? true} onclick={() => k.commands.run("layout.togglePrimarySidebar")}><Icon name="panel-left" size={15} /></button>
	<div class="flex flex-1 justify-center truncate" data-tauri-drag-region>{note ? note.replace(/\.md$/, "").split("/").pop() : "Obsidian"} <span class="ml-1 opacity-50" data-tauri-drag-region>- Showcase vault</span></div>
	<button class="mr-1 rounded p-1 hover:bg-black/5 dark:hover:bg-white/10" aria-label="Toggle right sidebar" aria-pressed={regions?.inspector?.visible ?? false} onclick={() => k.commands.run("layout.toggleSecondarySidebar")}><Icon name="panel-right" size={15} /></button>
	<WindowControls />
</div>
