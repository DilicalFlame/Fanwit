<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import MenuBar from "$fanwit/workbench/MenuBar.svelte";
	import WindowControls from "$fanwit/workbench/WindowControls.svelte";

	/** Photoshop's bar: the Ps mark, the menu bar, then search and Share on the right. */
	const k = getKernel();
</script>

<div class="fw-titlebar-inset flex h-full w-full items-center gap-1 bg-[#2b2b2b] text-[12.5px] text-[#d6d6d6]" data-tauri-drag-region>
	<span class="ml-2 flex size-6 shrink-0 items-center justify-center rounded-[5px] border border-[#31a8ff] bg-[#001e36] text-[11px] font-bold text-[#31a8ff]">Ps</span>
	<MenuBar app={false} />
	<div class="flex-1" data-tauri-drag-region></div>
	<button class="rounded p-1.5 hover:bg-white/10" aria-label="Search" title="Search" onclick={() => k.commands.run("palette.quickOpen")}><Icon name="search" size={15} /></button>
	<button class="mr-2 rounded-full bg-[#1473e6] px-3 py-1 text-xs font-medium text-white hover:bg-[#0d66d0]" onclick={() => k.sys.notify.toast("Invite sent (it's a showcase)", "success")}>Share</button>
	<WindowControls />
</div>
