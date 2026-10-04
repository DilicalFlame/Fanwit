<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import WindowControls from "$fanwit/workbench/WindowControls.svelte";

	/** Office's green bar: app launcher, AutoSave, quick access, the file name, search, account. */
	const k = getKernel();
	let autosave = $state(true);
</script>

<div class="fw-titlebar-inset flex h-full w-full items-center gap-1 bg-[#107c41] text-[12.5px] text-white" data-tauri-drag-region>
	<button class="ml-1 rounded p-1.5 hover:bg-white/15" aria-label="App launcher" onclick={(e) => k.sys.menus.show("titlebar/app", e.clientX, e.clientY + 12)}><Icon name="grid-3x3" size={15} /></button>
	<span class="ml-1 flex items-center gap-1.5">
		AutoSave
		<button role="switch" aria-checked={autosave} aria-label="AutoSave" class="relative h-4 w-8 rounded-full border border-white/70 {autosave ? 'bg-white' : ''}" onclick={() => (autosave = !autosave)}>
			<span class="absolute top-0.5 size-2.5 rounded-full transition-all {autosave ? 'left-[18px] bg-[#107c41]' : 'left-0.5 bg-white'}"></span>
		</button>
	</span>
	<button class="ml-2 rounded p-1 hover:bg-white/15" aria-label="Save" title="Save"><Icon name="save" size={15} /></button>
	<button class="rounded p-1 hover:bg-white/15" aria-label="Undo" title="Undo" onclick={() => k.commands.run("history.undo").catch(() => {})}><Icon name="undo-2" size={15} /></button>
	<button class="rounded p-1 hover:bg-white/15" aria-label="Redo" title="Redo" onclick={() => k.commands.run("history.redo").catch(() => {})}><Icon name="redo-2" size={15} /></button>
	<div class="flex flex-1 justify-center gap-1" data-tauri-drag-region><b data-tauri-drag-region>Budget 2026.xlsx</b><span class="opacity-80" data-tauri-drag-region>· {autosave ? "Saved" : "Not saved"}</span></div>
	<button class="flex h-7 w-60 items-center gap-2 rounded bg-white/15 px-2 text-xs text-white/90 hover:bg-white/25 max-md:hidden" onclick={() => k.commands.run("palette.open")}><Icon name="search" size={13} />Search (Ctrl+Shift+P)</button>
	<span class="mx-2 flex size-6 items-center justify-center rounded-full bg-[#c43e1c] text-[11px] font-semibold">Y</span>
	<WindowControls />
</div>
