<script lang="ts">
	import Icon from "$fanwit/icons/Icon.svelte";
	import WindowControls from "$fanwit/workbench/WindowControls.svelte";
	import { server } from "./discord.svelte";

	/** Discord's thin bar: the wordmark, the server you are in, inbox and help. */
	const s = $derived(server());
</script>

<div class="fw-titlebar-inset flex h-full w-full items-center bg-[#e3e5e8] text-xs text-[#4e5058] dark:bg-[#1e1f22] dark:text-[#949ba4]" data-tauri-drag-region>
	<span class="pl-3 font-extrabold tracking-wide" data-tauri-drag-region>FANWIT</span>
	<div class="flex flex-1 justify-center font-medium" data-tauri-drag-region>{s.name}</div>
	<button class="rounded p-1 hover:bg-black/10 dark:hover:bg-white/10" aria-label="Inbox" title="Inbox"><Icon name="inbox" size={15} /></button>
	<button class="mr-1 rounded p-1 hover:bg-black/10 dark:hover:bg-white/10" aria-label="Help" title="Help"><Icon name="circle-question-mark" size={15} /></button>
	<WindowControls />
</div>
