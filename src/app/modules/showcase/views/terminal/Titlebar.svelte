<script lang="ts">
	import MenuBar from "$fanwit/workbench/MenuBar.svelte";
	import WindowControls from "$fanwit/workbench/WindowControls.svelte";
	import TitlebarTabs from "../shared/TitlebarTabs.svelte";

	/** Windows Terminal style: the shell tabs live in the title bar, next to the app button. */
</script>

<div class="fw-titlebar-inset flex h-full w-full items-stretch bg-[#1f1f1f] text-[#cccccc]" data-tauri-drag-region>
	<div class="flex items-center pl-1"><MenuBar menus={false} icon="square-terminal" /></div>
	<div class="min-w-0 flex-1" data-tauri-drag-region><TitlebarTabs view="showcase.terminal" fallback="terminals" newCommand="showcase.terminal.new" tone="dark" /></div>
	<WindowControls />
</div>
