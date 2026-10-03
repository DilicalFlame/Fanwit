<script lang="ts">
	import { onMount } from "svelte";
	import { getKernel } from "../ui.svelte";
	import { useWindow } from "../windows/windows.svelte";

	/**
	 * Quick capture (Figure 17.17 #2): a palette window opened by a global shortcut; Enter appends
	 * to Inbox.md through a command (so it is scriptable from the CLI), Esc or blur dismisses.
	 */
	const k = getKernel();
	let self: ReturnType<typeof useWindow> | null = null;
	try {
		self = useWindow();
	} catch {
		self = null;
	}
	let text = $state("");
	let input = $state<HTMLInputElement>();
	onMount(() => {
		input?.focus();
		const d = k.host.windows.onFocusChanged((f) => !f && k.host.caps.nativeWindows && self?.close());
		return () => d.dispose();
	});
	async function save() {
		if (!text.trim()) return;
		try {
			await k.commands.run("capture.append", { text: text.trim() }, { source: "palette" });
			text = "";
			await self?.close(true);
		} catch (e) {
			k.sys.notify.error(e);
		}
	}
</script>

<div class="flex h-full flex-col justify-center gap-2 p-4" data-tauri-drag-region>
	<input bind:this={input} class="fw-input h-10 text-base" placeholder="Capture a thought, #tag, @date" aria-label="Quick capture" bind:value={text} onkeydown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") void self?.close(); }} />
	<div class="flex items-center justify-between text-xs text-muted-foreground">
		<span>Saves to <b>Inbox.md</b>{k.sys.vault.current ? ` in ${k.sys.vault.current.name}` : " (open a vault first)"}</span>
		<button class="fw-btn h-6" onclick={save}>Save ⏎</button>
	</div>
</div>
