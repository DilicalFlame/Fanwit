<script lang="ts">
	import { getKernel, menu, useT } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import { identity } from "../gen/identity";

	/**
	 * The app button (titlebar/app) and the menu bar (menubar/* locations), for the default and
	 * custom title bars. Alt and the arrow keys move along the bar. On macOS the menu bar is the
	 * native one, so only the app button shows. `collapsed` keeps just the app button (narrow).
	 */
	let { app = true, menus = true, collapsed = false, icon }: { app?: boolean; menus?: boolean; collapsed?: boolean; icon?: string } = $props();
	const k = getKernel();
	const t = useT();
	const nativeMenus = k.host.platform === "macos" && k.host.caps.nativeWindows;
	const MENUS = [
		["menubar/file", "File"],
		["menubar/edit", "Edit"],
		["menubar/view", "View"],
		["menubar/go", "Go"],
		["menubar/window", "Window"],
		["menubar/help", "Help"]
	] as const;
	let openMenu = $state<string | null>(null);

	function showMenu(loc: string, el: HTMLElement) {
		const r = el.getBoundingClientRect();
		openMenu = loc;
		k.sys.menus.show(loc, r.left, r.bottom + 2, { anchor: r, element: el });
	}
	$effect(() => {
		if (!k.sys.menus.open) openMenu = null;
	});
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
</script>

{#if app}
	<button class="flex h-7 shrink-0 items-center gap-1.5 rounded px-1.5 hover:bg-current/10" aria-label="{identity.name} menu" onclick={(e) => showMenu("titlebar/app", e.currentTarget)} use:menu={{ location: "titlebar/app" }}>
		{#if icon}<Icon name={icon} size={16} />{:else}<img src="/favicon.svg" alt="" class="size-4" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />{/if}
		{#if collapsed}<Icon name="menu" size={15} />{/if}
	</button>
{/if}
{#if menus && !nativeMenus && !collapsed}
	<div role="menubar" tabindex="-1" aria-label={t("ui.menubar.label", "Menu bar")} class="flex shrink-0 items-center" onkeydown={menubarKeys}>
		{#each MENUS as [loc, label] (loc)}
			<button
				role="menuitem"
				aria-haspopup="menu"
				aria-expanded={openMenu === loc}
				data-menubar={loc}
				data-fw-id="menubar-{label.toLowerCase()}"
				class="h-7 rounded px-2 text-[12.5px] hover:bg-current/10 {openMenu === loc ? 'bg-current/10' : ''}"
				onclick={(e) => showMenu(loc, e.currentTarget)}
				onpointerenter={(e) => openMenu && openMenu !== loc && showMenu(loc, e.currentTarget)}>{t(`ui.menubar.${label.toLowerCase()}`, label)}</button
			>
		{/each}
	</div>
{/if}
