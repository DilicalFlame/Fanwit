<script lang="ts">
	import { getKernel, menu, shortAgo } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import { enter, leave } from "../motion/motion";
	import EmptyState from "./EmptyState.svelte";
	import type { NotificationItem } from "../notify/notify.svelte";

	/** Notification centre drawer (Figure 17.12): Today and Earlier, DND, actions, snooze, clear. */
	const k = getKernel();
	const notify = k.sys.notify;
	const startOfDay = new Date().setHours(0, 0, 0, 0);
	const today = $derived(notify.items.filter((i) => i.time >= startOfDay));
	const earlier = $derived(notify.items.filter((i) => i.time < startOfDay));
	const ICON: Record<string, string> = { info: "info", success: "circle-check", warning: "triangle-alert", error: "circle-x", progress: "loader-circle" };
	const COLOR: Record<string, string> = { info: "text-info", success: "text-success", warning: "text-warning", error: "text-destructive", progress: "text-muted-foreground" };
	let dndMenu = $state(false);

	$effect(() => {
		if (notify.centerOpen) setTimeout(() => notify.markRead(), 1500);
	});
</script>

{#snippet entry(i: NotificationItem)}
	<li class="group flex gap-2 rounded-lg border border-border p-3 {i.read ? '' : 'bg-accent/40'}" use:menu={{ location: "notification/item", target: { id: i.id } }}>
		<Icon name={i.icon ?? ICON[i.kind]} size={16} class="mt-0.5 shrink-0 {COLOR[i.kind]}" />
		<div class="min-w-0 flex-1">
			<div class="flex items-start gap-2">
				<span class="flex-1 text-[13px] font-medium break-words">{i.title}{#if i.count > 1}<span class="ml-1 text-[10px] text-muted-foreground">x{i.count}</span>{/if}</span>
				<span class="shrink-0 text-[11px] text-muted-foreground">{shortAgo(i.time)}</span>
			</div>
			{#if i.body}<div class="mt-0.5 text-xs break-words text-muted-foreground">{i.body}</div>{/if}
			{#if i.actions.length}
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#each i.actions as a, n (n)}<button class="fw-btn h-6" onclick={() => notify.act(i, a)}>{a.label}</button>{/each}
				</div>
			{/if}
		</div>
		<button class="fw-icon-btn opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label="Remove notification" onclick={() => notify.remove(i.id)}><Icon name="x" size={13} /></button>
	</li>
{/snippet}

{#if notify.centerOpen}
	<button out:leave class="fixed inset-0 z-[70] cursor-default" aria-label="Close notifications" onclick={() => (notify.centerOpen = false)} tabindex="-1"></button>
	<aside use:enter={"right"} out:leave={{ preset: "right" }} class="fixed top-10 right-2 bottom-8 z-[71] flex w-[min(380px,calc(100%-16px))] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl" aria-label="Notification centre">
		<header class="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
			<span class="flex-1 text-sm font-semibold">Notifications</span>
			<div class="relative">
				<button class="fw-btn h-7 {notify.dnd ? 'fw-btn-primary' : ''}" aria-expanded={dndMenu} onclick={() => (dndMenu = !dndMenu)}><Icon name={notify.dnd ? "bell-off" : "bell"} size={13} /> DND</button>
				{#if dndMenu}
					<div class="absolute right-0 top-8 z-10 w-44 rounded-md border border-border bg-popover p-1 shadow-lg" role="menu">
						{#each [[30, "For 30 minutes"], [60, "For 1 hour"], [240, "For 4 hours"], [1440, "Until tomorrow"], [0, "Turn off"]] as [m, label] (m)}
							<button role="menuitem" class="fw-menu-row" onclick={() => { notify.setDnd(m as number); dndMenu = false; }}>{label}</button>
						{/each}
					</div>
				{/if}
			</div>
			<button class="fw-icon-btn" title="Channel settings" aria-label="Channel settings" onclick={() => k.commands.run("app.settings", { page: "Notifications" })}><Icon name="settings-2" size={14} /></button>
			<button class="fw-icon-btn" title="Clear all" aria-label="Clear all" onclick={() => notify.clearAll()}><Icon name="list-x" size={14} /></button>
			<button class="fw-icon-btn" aria-label="Close" onclick={() => (notify.centerOpen = false)}><Icon name="x" size={14} /></button>
		</header>
		<div class="min-h-0 flex-1 overflow-y-auto p-2">
			{#if !notify.items.length}
				<EmptyState icon="bell" title="You're all caught up" description="Notifications that need your attention collect here." />
			{/if}
			{#if today.length}
				<div class="fw-section-title px-1">Today</div>
				<ul class="flex flex-col gap-2">{#each today as i (i.id)}{@render entry(i)}{/each}</ul>
			{/if}
			{#if earlier.length}
				<div class="fw-section-title px-1">Earlier</div>
				<ul class="flex flex-col gap-2">{#each earlier as i (i.id)}{@render entry(i)}{/each}</ul>
			{/if}
		</div>
	</aside>
{/if}
