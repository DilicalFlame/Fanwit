<script lang="ts">
	import { getKernel, menu } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import KeyChip from "./KeyChip.svelte";
	import { identity } from "../gen/identity";

	/**
	 * Custom title bar (Section 9.8): drag region, app mark, menu bar (menubar/* locations),
	 * centred search, layout toggles and window controls. macOS keeps the native traffic lights.
	 */
	let { title, compact = false, showMenus = true, closeOnly = false }: { title?: string; compact?: boolean; showMenus?: boolean; closeOnly?: boolean } = $props();
	const k = getKernel();
	const host = k.host;
	const mac = host.platform === "macos";
	const web = !host.caps.nativeWindows;
	const MENUS = [
		["menubar/file", "File"],
		["menubar/edit", "Edit"],
		["menubar/view", "View"],
		["menubar/go", "Go"],
		["menubar/window", "Window"],
		["menubar/help", "Help"]
	] as const;
	let width = $state(1200);
	let maximized = $state(false);
	let openMenu = $state<string | null>(null);
	const vaultName = $derived(k.sys.vault.current?.name);
	const layout = k.sys.layout;
	const regions = $derived(layout.doc.window[layout.windowId]?.regions);

	$effect(() => {
		void host.windows.isMaximized().then((m) => (maximized = m));
		const d = host.windows.onResized(() => void host.windows.isMaximized().then((m) => (maximized = m)));
		return () => d.dispose();
	});

	function showMenu(loc: string, el: HTMLElement) {
		const r = el.getBoundingClientRect();
		openMenu = loc;
		k.sys.menus.show(loc, r.left, r.bottom + 2, { anchor: r, element: el });
	}
	$effect(() => {
		if (!k.sys.menus.open) openMenu = null;
	});
	/** Mnemonic: Alt focuses the menu bar (Windows and Linux). */
	function menubarKeys(e: KeyboardEvent) {
		const btns = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-menubar]")];
		const i = btns.indexOf(document.activeElement as HTMLElement);
		if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
			e.preventDefault();
			const n = btns[(i + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length];
			n.focus();
			if (openMenu) showMenu(n.dataset.menubar!, n);
		} else if (e.key === "ArrowDown" || e.key === "Enter") {
			e.preventDefault();
			showMenu(btns[i].dataset.menubar!, btns[i]);
		}
	}
	const narrow = $derived(width < 720);
</script>

<header
	class="relative flex h-9 shrink-0 items-center gap-1 border-b border-border bg-titlebar pr-0 text-titlebar-foreground select-none"
	class:pl-20={mac && !web}
	class:pl-1={!mac || web}
	bind:clientWidth={width}
	data-tauri-drag-region
	data-fw-region="titlebar"
	ondblclick={(e) => (e.target as HTMLElement).hasAttribute("data-tauri-drag-region") && !web && host.windows.toggleMaximize()}
>
	{#if !compact}
		<button class="flex h-7 items-center gap-1.5 rounded px-1.5 hover:bg-accent/60" aria-label="{identity.name} menu" onclick={(e) => showMenu("titlebar/app", e.currentTarget)} use:menu={{ location: "titlebar/app" }}>
			<img src="/favicon.svg" alt="" class="size-4" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
			{#if narrow}<Icon name="menu" size={15} />{/if}
		</button>
		{#if showMenus && !(mac && !web) && !narrow}
			<nav role="menubar" aria-label="Menu bar" class="flex items-center" onkeydown={menubarKeys}>
				{#each MENUS as [loc, label] (loc)}
					<button
						role="menuitem"
						aria-haspopup="menu"
						aria-expanded={openMenu === loc}
						data-menubar={loc}
						data-fw-id="menubar-{label.toLowerCase()}"
						class="h-7 rounded px-2 text-[12.5px] hover:bg-accent/60 {openMenu === loc ? 'bg-accent/60' : ''}"
						onclick={(e) => showMenu(loc, e.currentTarget)}
						onpointerenter={(e) => openMenu && openMenu !== loc && showMenu(loc, e.currentTarget)}>{label}</button
					>
				{/each}
			</nav>
		{/if}
	{:else}
		<span class="px-2 text-xs font-medium" data-tauri-drag-region>{title ?? identity.name}</span>
	{/if}

	<div class="flex flex-1 justify-center px-2" data-tauri-drag-region>
		{#if !compact}
			<button
				class="flex h-6 w-full max-w-md items-center gap-2 rounded-md border border-border bg-background/60 px-2 text-xs text-muted-foreground hover:bg-background"
				onclick={() => k.commands.run("palette.quickOpen")}
				aria-label="Search or run a command"
			>
				<Icon name="search" size={13} />
				<span class="flex-1 truncate text-left">{vaultName ? `Search ${vaultName}` : "Search or run a command"}</span>
				<KeyChip keys={k.keys.label("palette.quickOpen")} />
			</button>
		{:else if title}
			<span class="truncate text-xs text-muted-foreground" data-tauri-drag-region>{title}</span>
		{/if}
	</div>

	{#if !compact && !narrow}
		<div class="flex items-center gap-0.5 pr-1">
			<button class="fw-icon-btn" aria-label="Toggle primary sidebar" aria-pressed={regions?.sidebar?.visible ?? true} title="Toggle primary sidebar" onclick={() => k.commands.run("layout.togglePrimarySidebar")}>
				<Icon name={(regions?.sidebar?.visible ?? true) ? "panel-left" : "panel-left-dashed"} size={15} />
			</button>
			<button class="fw-icon-btn" aria-label="Toggle panel" aria-pressed={regions?.panel?.visible ?? false} title="Toggle panel" onclick={() => k.commands.run("layout.togglePanel")}>
				<Icon name={regions?.panel?.visible ? "panel-bottom" : "panel-bottom-dashed"} size={15} />
			</button>
			<button class="fw-icon-btn" aria-label="Toggle secondary sidebar" aria-pressed={regions?.inspector?.visible ?? false} title="Toggle secondary sidebar" onclick={() => k.commands.run("layout.toggleSecondarySidebar")}>
				<Icon name={regions?.inspector?.visible ? "panel-right" : "panel-right-dashed"} size={15} />
			</button>
		</div>
	{/if}

	{#if !web && !mac}
		<div class="flex h-full items-stretch">
			{#if !closeOnly}
				<button class="flex w-11 items-center justify-center hover:bg-accent" aria-label="Minimize" onclick={() => host.windows.minimize()}><Icon name="minus" size={15} /></button>
				<button class="flex w-11 items-center justify-center hover:bg-accent" aria-label={maximized ? "Restore" : "Maximize"} onclick={() => host.windows.toggleMaximize()}>
					<Icon name={maximized ? "copy" : "square"} size={13} />
				</button>
			{/if}
			<button class="flex w-11 items-center justify-center hover:bg-red-600 hover:text-white" aria-label="Close" onclick={() => k.commands.run("window.close").catch(() => host.windows.close())}><Icon name="x" size={16} /></button>
		</div>
	{/if}
</header>
