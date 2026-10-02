<script lang="ts">
	import { getKernel } from "../ui.svelte";
	import LayoutRoot from "./layout/LayoutRoot.svelte";
	import TitleBar from "./TitleBar.svelte";
	import StatusBar from "./StatusBar.svelte";
	import Overlays from "./Overlays.svelte";
	import { ctxkeys } from "../kernel/context.svelte";

	/** The main window: title bar, the workspace layout, status bar and every overlay. */
	let { windowId = "main" }: { windowId?: string } = $props();
	const k = getKernel();
	const locked = $derived(k.sys.windows.locked && !k.host.caps.nativeWindows);
	const title = $derived.by(() => {
		const t = k.sys.layout.doc.window[windowId]?.title ?? "${vault.name} - ${app.name}";
		const vault = k.sys.vault.current?.name;
		return t
			.replace("${vault.name} - ", vault ? `${vault} - ` : "")
			.replace("${vault.name}", vault ?? "")
			.replace("${app.name}", k.sys.info.name)
			.replace("${pane.title}", k.sys.layout.activePane ? k.sys.layout.paneTitle(k.sys.layout.activePane) : "");
	});
	$effect(() => {
		void k.host.windows.setTitle(title);
	});
</script>

<div class="flex h-dvh w-full flex-col" inert={locked} use:ctxkeys={{ "window.id": windowId }}>
	<LayoutRoot {windowId}>
		{#snippet titlebar()}<TitleBar />{/snippet}
		{#snippet statusbar()}<StatusBar />{/snippet}
	</LayoutRoot>
</div>
<Overlays />
