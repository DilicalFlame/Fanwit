<script lang="ts">
	import { getKernel, menu } from "../../ui.svelte";
	import type { RegionName } from "../../layout/model";
	import Icon from "../../icons/Icon.svelte";

	/**
	 * Icon rail switching the region's view containers. Clicking the active item toggles the
	 * region; badges show counts; roving focus with arrow keys; right click for activity/item.
	 */
	let { region, windowId, orientation = "vertical", ondrawer }: { region: RegionName; windowId: string; orientation?: "vertical" | "horizontal"; ondrawer?: (open: boolean) => void } = $props();
	const k = getKernel();
	const layout = k.sys.layout;
	const st = $derived(layout.doc.window[windowId]?.regions?.[region]);
	const containers = $derived(st?.containers ?? (st?.node ? [st.node] : []));
	const visible = $derived(st?.visible ?? true);

	function activate(id: string) {
		if (ondrawer) {
			if (id === st?.node) ondrawer(true);
			else void layout.dispatch({ type: "setRegion", region, attrs: { node: id }, window: windowId }, { undoable: false }).then(() => ondrawer(true));
			return;
		}
		if (id === st?.node) void layout.dispatch({ type: "toggleRegion", region, window: windowId });
		else void layout.dispatch({ type: "setRegion", region, attrs: { node: id, visible: true }, window: windowId });
	}
	function keys(e: KeyboardEvent) {
		const btns = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-activity]")];
		const i = btns.indexOf(document.activeElement as HTMLElement);
		const next = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
		if (next && i >= 0) {
			e.preventDefault();
			btns[(i + next + btns.length) % btns.length].focus();
		}
	}
</script>

<nav
	aria-label="{region} views"
	data-fw-region={region === "sidebar" ? "activity" : "activity2"}
	class="flex shrink-0 bg-activity text-activity-foreground {orientation === 'vertical' ? 'w-12 flex-col items-center gap-1 py-2' : 'h-12 w-full flex-row items-center justify-around border-t border-border'}"
	onkeydown={keys}
>
	{#each containers as id (id)}
		{@const node = layout.doc.node[id] as { title?: string; icon?: string } | undefined}
		{@const isActive = id === st?.node && (visible || !!ondrawer)}
		<button
			data-activity={id}
			data-fw-id="activity-{id}"
			class="relative flex size-10 items-center justify-center rounded-md transition-colors hover:text-activity-active {isActive ? 'text-activity-active' : ''}"
			aria-label={node?.title ?? id}
			aria-pressed={isActive}
			title={node?.title ?? id}
			tabindex={id === st?.node ? 0 : -1}
			onclick={() => activate(id)}
			use:menu={{ location: "activity/item", target: { node: id, region } }}
		>
			{#if isActive}<span class="absolute {orientation === 'vertical' ? 'inset-y-2 left-0 w-0.5' : 'inset-x-2 top-0 h-0.5'} rounded bg-activity-active"></span>{/if}
			<Icon name={node?.icon ?? "square"} size={20} />
		</button>
	{/each}
	{#if orientation === "vertical" && region === "sidebar"}
		<div class="flex-1"></div>
		<button class="flex size-10 items-center justify-center rounded-md hover:text-activity-active" aria-label="Manage" title="Manage" onclick={(e) => {
			const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
			k.sys.menus.show("activity/manage", r.right + 4, r.top, { anchor: r });
		}}>
			<Icon name="settings" size={20} />
		</button>
	{/if}
</nav>
