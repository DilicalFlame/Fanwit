<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import MenuBar from "$fanwit/workbench/MenuBar.svelte";
	import WindowControls from "$fanwit/workbench/WindowControls.svelte";
	import { figma } from "./figma.svelte";

	/** Figma's dark bar: main menu, the file name in the middle, collaborators, Share and zoom. */
	const k = getKernel();
	let name = $state("Mobile app");
	let renaming = $state(false);
</script>

<div class="fw-titlebar-inset flex h-full w-full items-center gap-2 bg-[#2c2c2c] text-[#e5e5e5]" data-tauri-drag-region>
	<div class="flex items-center pl-1"><MenuBar menus={false} icon="pen-tool" /></div>
	<div class="flex flex-1 items-center justify-center gap-1 text-xs" data-tauri-drag-region>
		<span class="opacity-60" data-tauri-drag-region>Drafts /</span>
		{#if renaming}
			<!-- svelte-ignore a11y_autofocus -->
			<input class="w-40 rounded bg-white/10 px-1.5 py-0.5 text-center font-medium outline-none" autofocus bind:value={name} onblur={() => (renaming = false)} onkeydown={(e) => e.key === "Enter" && (renaming = false)} />
		{:else}
			<button class="flex items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:bg-white/10" title="Rename" onclick={() => (renaming = true)}>{name}<Icon name="chevron-down" size={12} class="opacity-60" /></button>
		{/if}
	</div>
	<div class="flex items-center gap-2 pr-2">
		<div class="flex -space-x-1.5">
			{#each [["A", "#f24e1e"], ["G", "#a259ff"], ["L", "#0acf83"]] as [who, c] (who)}<span class="flex size-6 items-center justify-center rounded-full border-2 border-[#2c2c2c] text-[10px] font-semibold text-white" style:background={c}>{who}</span>{/each}
		</div>
		<button class="rounded p-1 hover:bg-white/10" aria-label="Present" title="Present"><Icon name="play" size={15} /></button>
		<button class="rounded-md bg-[#0d99ff] px-3 py-1 text-xs font-medium text-white hover:bg-[#0b85de]" onclick={() => k.sys.notify.toast("Link copied (it's a showcase)", "success")}>Share</button>
		<span class="w-10 text-right font-mono text-[11px] opacity-70">{Math.round(figma.zoom * 100)}%</span>
	</div>
	<WindowControls />
</div>
