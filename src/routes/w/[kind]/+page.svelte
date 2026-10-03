<script lang="ts">
	import { page } from "$app/state";
	import { getKernel } from "$fanwit/ui.svelte";
	import TitleBar from "$fanwit/workbench/TitleBar.svelte";
	import WindowView from "$fanwit/workbench/WindowView.svelte";
	import Overlays from "$fanwit/workbench/Overlays.svelte";
	import LayoutRoot from "$fanwit/workbench/layout/LayoutRoot.svelte";
	import EmptyState from "$fanwit/workbench/EmptyState.svelte";
	import type { WindowSelf } from "$fanwit/windows/windows.svelte";

	/**
	 * Every non main window kind (/w/settings, /w/menu-editor, /w/view?window=..., child and panel
	 * windows). The window renders its kind's root view; close(value) resolves the opener.
	 */
	const k = getKernel();
	const kind = $derived(page.params.kind ?? "");
	const params = page.url.searchParams;
	const label = params.get("label") ?? k.host.windows.label;
	const opener = params.get("opener");
	let props: Record<string, unknown> = {};
	try {
		props = JSON.parse(params.get("props") ?? "{}");
	} catch {
		props = {};
	}
	const spec = $derived(k.sys.windows.kinds.get(kind));
	let title = $state("");
	$effect(() => {
		title = spec ? k.sys.windows.title(spec, props) : kind;
	});
	$effect(() => void k.host.windows.setTitle(title));

	const self: WindowSelf = {
		label,
		kind,
		props,
		opener,
		close: async (value?: unknown) => {
			k.events.emit("fw:window-result" as never, { label, value } as never, { scope: "app" });
			await k.host.windows.close();
		},
		setTitle: (t) => (title = t)
	};
	const layoutWindow = params.get("window");
	// a popped out layout window docks its panes back when closed
	if (kind === "view" && layoutWindow) {
		k.host.windows.onCloseRequested(async () => {
			await k.sys.layout.dispatch({ type: "popIn", window: layoutWindow });
			await k.sys.layout.flush();
			return true;
		});
	}
	const compact = $derived(spec?.base === "child" || spec?.base === "sheet" || spec?.base === "palette" || spec?.base === "panel");
	const css = $derived(spec?.shadow === "css");
</script>

<div class="flex h-dvh flex-col {css ? 'p-3' : ''}">
	<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background {css ? 'rounded-xl border border-border shadow-2xl' : ''}">
		{#if spec?.decorations !== "none" && spec?.decorations !== "native"}
			<TitleBar {title} compact showMenus={false} closeOnly={compact} />
		{/if}
		<div class="relative flex min-h-0 flex-1 flex-col">
			{#if kind === "view" && layoutWindow}
				<LayoutRoot windowId={layoutWindow} />
			{:else if spec?.view}
				<WindowView view={spec.view} {props} {self} />
			{:else}
				<EmptyState icon="circle-help" title="Unknown window kind" description={`"${kind}" is not registered.`} />
			{/if}
		</div>
	</div>
</div>
<Overlays />
