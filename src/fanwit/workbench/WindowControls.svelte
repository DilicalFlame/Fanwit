<script lang="ts">
	import { getKernel } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";

	/**
	 * Minimise, maximise and close for frameless windows (Windows and Linux). Nothing on macOS,
	 * which keeps the native traffic lights, or on the web. Colours follow the bar's text colour,
	 * so custom title bars can place it on any background.
	 */
	let { closeOnly = false, class: cls = "" }: { closeOnly?: boolean; class?: string } = $props();
	const k = getKernel();
	const host = k.host;
	const shown = host.caps.nativeWindows && host.platform !== "macos";
	let maximized = $state(false);

	$effect(() => {
		if (!shown) return;
		void host.windows.isMaximized().then((m) => (maximized = m));
		const d = host.windows.onResized(() => void host.windows.isMaximized().then((m) => (maximized = m)));
		return () => d.dispose();
	});
</script>

{#if shown}
	<div class="flex h-full shrink-0 items-stretch {cls}">
		{#if !closeOnly}
			<button class="flex w-11 items-center justify-center hover:bg-current/10" aria-label="Minimize" onclick={() => host.windows.minimize()}><Icon name="minus" size={15} /></button>
			<button class="flex w-11 items-center justify-center hover:bg-current/10" aria-label={maximized ? "Restore" : "Maximize"} onclick={() => host.windows.toggleMaximize()}>
				<Icon name={maximized ? "copy" : "square"} size={13} />
			</button>
		{/if}
		<button class="flex w-11 items-center justify-center hover:bg-red-600 hover:text-white" aria-label="Close" onclick={() => k.commands.run("window.close").catch(() => host.windows.close())}><Icon name="x" size={16} /></button>
	</div>
{/if}
