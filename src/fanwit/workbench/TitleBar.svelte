<script lang="ts">
	import { getKernel, useT } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import KeyChip from "./KeyChip.svelte";
	import MenuBar from "./MenuBar.svelte";
	import WindowControls from "./WindowControls.svelte";
	import NodeView from "./layout/NodeView.svelte";
	import { identity } from "../gen/identity";

	/**
	 * Custom title bar (Section 9.8): drag region, app button, menu bar, centred search, layout
	 * toggles and window controls. macOS keeps the native traffic lights.
	 *
	 * A layout can replace the contents: `titlebar = { node = "<id>", size = "40px" }` renders that
	 * node (usually one view in a tab set with a hidden strip) across the whole bar. The view draws
	 * its own background, marks empty space with `data-tauri-drag-region`, pads its start with the
	 * `fw-titlebar-inset` class (room for the macOS traffic lights) and places <WindowControls />.
	 */
	let { title, compact = false, showMenus = true, closeOnly = false }: { title?: string; compact?: boolean; showMenus?: boolean; closeOnly?: boolean } = $props();
	const k = getKernel();
	const t = useT();
	const host = k.host;
	const mac = host.platform === "macos";
	const web = !host.caps.nativeWindows;
	let width = $state(1200);
	const vaultName = $derived(k.sys.vault.current?.name);
	const layout = k.sys.layout;
	const regions = $derived(layout.doc.window[layout.windowId]?.regions);
	const custom = $derived(!compact && regions?.titlebar?.node && layout.doc.node[regions.titlebar.node] ? regions.titlebar.node : null);
	const size = $derived(regions?.titlebar?.size);
	const narrow = $derived(width < 720);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions (double click is the Toggle maximize command; right click mirrors the native title bar system menu) -->
<header
	class="relative flex shrink-0 items-center gap-1 text-titlebar-foreground select-none {custom ? '' : 'h-9 border-b border-border bg-titlebar'}"
	class:pl-20={!custom && mac && !web}
	class:pl-1={!custom && (!mac || web)}
	style:height={custom ? (typeof size === "number" ? `${size}px` : (size ?? "36px")) : undefined}
	style:--fw-titlebar-inset={mac && !web ? "80px" : "0px"}
	bind:clientWidth={width}
	data-tauri-drag-region
	data-fw-region="titlebar"
	ondblclick={(e) => (e.target as HTMLElement).hasAttribute("data-tauri-drag-region") && !web && host.windows.toggleMaximize()}
	oncontextmenu={(e) => {
		// Windows: the native system menu on the drag region, like a native title bar
		if (host.platform === "windows" && !web && (e.target as HTMLElement).hasAttribute("data-tauri-drag-region")) {
			e.preventDefault();
			e.stopPropagation();
			void host.windows.showSystemMenu?.();
		}
	}}
>
	{#if custom}
		<div class="flex h-full min-w-0 flex-1"><NodeView node={custom} region="titlebar" /></div>
	{:else}
		{#if !compact}
			<MenuBar menus={showMenus} collapsed={narrow} />
		{:else}
			<span class="px-2 text-xs font-medium" data-tauri-drag-region>{title ?? identity.name}</span>
		{/if}

		<div class="flex flex-1 justify-center px-2" data-tauri-drag-region>
			{#if !compact}
				<button
					class="flex h-6 w-full max-w-md items-center gap-2 rounded-md border border-border bg-background/60 px-2 text-xs text-muted-foreground hover:bg-background"
					onclick={() => k.commands.run("palette.quickOpen")}
					aria-label={t("ui.titlebar.search", "Search or run a command")}
				>
					<Icon name="search" size={13} />
					<span class="flex-1 truncate text-left">{vaultName ? t("ui.titlebar.searchVault", "Search {name}", { name: vaultName }) : t("ui.titlebar.search", "Search or run a command")}</span>
					<KeyChip keys={k.keys.label("palette.quickOpen")} />
				</button>
			{:else if title}
				<span class="truncate text-xs text-muted-foreground" data-tauri-drag-region>{title}</span>
			{/if}
		</div>

		{#if !compact && !narrow}
			<div class="flex items-center gap-0.5 pr-1">
				<button class="fw-icon-btn" aria-label={k.commands.title("layout.togglePrimarySidebar")} aria-pressed={regions?.sidebar?.visible ?? true} title={k.commands.title("layout.togglePrimarySidebar")} onclick={() => k.commands.run("layout.togglePrimarySidebar")}>
					<Icon name={(regions?.sidebar?.visible ?? true) ? "panel-left" : "panel-left-dashed"} size={15} />
				</button>
				<button class="fw-icon-btn" aria-label={k.commands.title("layout.togglePanel")} aria-pressed={regions?.panel?.visible ?? false} title={k.commands.title("layout.togglePanel")} onclick={() => k.commands.run("layout.togglePanel")}>
					<Icon name={regions?.panel?.visible ? "panel-bottom" : "panel-bottom-dashed"} size={15} />
				</button>
				<button class="fw-icon-btn" aria-label={k.commands.title("layout.toggleSecondarySidebar")} aria-pressed={regions?.inspector?.visible ?? false} title={k.commands.title("layout.toggleSecondarySidebar")} onclick={() => k.commands.run("layout.toggleSecondarySidebar")}>
					<Icon name={regions?.inspector?.visible ? "panel-right" : "panel-right-dashed"} size={15} />
				</button>
			</div>
		{/if}

		<WindowControls {closeOnly} />
	{/if}
</header>
