<script lang="ts">
	import { getKernel, menu } from "../ui.svelte";
	import { ctxkeys } from "../kernel/context.svelte";
	import Icon from "../icons/Icon.svelte";
	import type { StatusItem } from "./status.svelte";

	/**
	 * Status bar (Figure 17.1 #14). Left: vault switcher, chord hint. Right: contributed items by
	 * priority, problems, layout preset, theme mode and the notification bell. A live region.
	 */
	const k = getKernel();
	const { status, vault, notify, layout, themes } = k.sys;
	const problems = $derived(layout.diagnostics.length + (k.sys.settings.global.diagnostics.length ?? 0));
	const chord = $derived(k.keys.chord);
	const visible = (i: StatusItem) => (!!i.text || !!i.icon) && k.context.evaluate(i.when) && (void k.context.version, true);

	function run(i: StatusItem) {
		if (i.command) void k.commands.run(i.command, i.args ?? {}, { source: "toolbar" }).catch((e) => notify.error(e));
	}
</script>

{#snippet item(i: StatusItem)}
	{#if visible(i)}
		<!-- right click: statusbar/item with statusItem set, so modules and plugins can add items for theirs -->
		<button class="flex h-full items-center gap-1 px-2 hover:bg-white/10 disabled:hover:bg-transparent" title={i.tooltip} aria-label={i.label ?? i.tooltip ?? i.text} disabled={!i.command} onclick={() => run(i)} use:ctxkeys={{ statusItem: i.id }} use:menu={{ location: "statusbar/item" }}>
			{#if i.icon}<Icon name={i.icon} size={13} />{/if}
			{#if i.text}<span class="truncate">{i.text}</span>{/if}
		</button>
	{/if}
{/snippet}

<footer
	class="flex h-6 shrink-0 items-stretch justify-between bg-statusbar text-[11.5px] text-statusbar-foreground select-none"
	data-fw-region="statusbar"
	aria-label="Status bar"
	use:menu={{ location: "statusbar/item" }}
>
	<div class="flex min-w-0 items-stretch">
		<button class="flex items-center gap-1.5 px-2 hover:bg-white/10" title="Switch vault" onclick={() => k.commands.run("vault.switch")}>
			<Icon name={vault.current ? "library" : "folder-open"} size={13} />
			<span class="truncate">{vault.current ? vault.current.name : k.host.kind === "browser" ? "No vault (browser)" : "No vault"}</span>
			{#if vault.current?.readonly}<span class="rounded bg-white/15 px-1">read only</span>{/if}
		</button>
		{#each status.sorted("left") as i (i.id)}{@render item(i)}{/each}
		<span aria-live="polite" class="flex items-center px-2">
			{#if chord.length}
				<span class="rounded bg-white/15 px-1.5">{k.keys.format(chord).join(" ")} … waiting for next key</span>
			{/if}
		</span>
	</div>
	<div class="flex min-w-0 items-stretch">
		{#each status.sorted("right") as i (i.id)}{@render item(i)}{/each}
		{#if problems}
			<button class="flex items-center gap-1 px-2 hover:bg-white/10" title="Problems" onclick={() => layout.openView("fanwit.problems", {}, { target: "panel" })}>
				<Icon name="circle-alert" size={13} />{problems}
			</button>
		{/if}
		{#if layout.doc.preset}
			<button class="flex items-center gap-1 px-2 hover:bg-white/10" title="Layout preset" onclick={() => k.commands.run("layout.applyPreset", {}, { source: "toolbar" })}>
				<Icon name="layout-template" size={13} />{layout.doc.preset}
			</button>
		{/if}
		<button class="flex items-center px-2 hover:bg-white/10" title="Toggle light and dark" aria-label="Toggle light and dark" onclick={() => k.commands.run("theme.toggleMode")}>
			<Icon name={themes.mode === "dark" ? "moon" : "sun"} size={13} />
		</button>
		<button class="relative flex items-center gap-1 px-2 hover:bg-white/10" title="Notifications" aria-label="Notifications, {notify.unread} unread" onclick={() => (notify.centerOpen = !notify.centerOpen)}>
			<Icon name={notify.dnd ? "bell-off" : notify.unread ? "bell-dot" : "bell"} size={13} />
			{#if notify.unread}<span>{notify.unread}</span>{/if}
		</button>
	</div>
</footer>
