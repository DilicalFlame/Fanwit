<script lang="ts">
	import WindowControls from "$fanwit/workbench/WindowControls.svelte";
	import TitlebarTabs from "../shared/TitlebarTabs.svelte";

	/** Chrome style: the page tabs live in the title bar; the address bar sits below. */
</script>

<div class="fw-titlebar-inset flex h-full w-full items-stretch bg-[#dee1e6] text-[#1f1f1f] dark:bg-[#202124] dark:text-[#e8eaed]" data-tauri-drag-region>
	<div class="min-w-0 flex-1 pl-2" data-tauri-drag-region><TitlebarTabs view="showcase.browser.page" fallback="pages" newCommand="showcase.browser.newTab" /></div>
	<WindowControls />
</div>
