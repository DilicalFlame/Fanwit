<script lang="ts">
	import { getKernel } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import type { Toast } from "../notify/notify.svelte";

	/**
	 * Toast stack (Section 10.4): bottom right by default, at most three visible with a "+n more"
	 * pill, hover or focus pauses timers, swipe to dismiss, announced through aria-live.
	 */
	const k = getKernel();
	const notify = k.sys.notify;
	const position = $derived(k.sys.settings.get<string>("notify.toastPosition") ?? "bottom-right");
	const visible = $derived(notify.toasts.slice(-3).reverse());
	const hidden = $derived(Math.max(0, notify.toasts.length - 3));
	const ICON: Record<string, string> = { info: "info", success: "circle-check", warning: "triangle-alert", error: "circle-x", progress: "loader-circle" };
	const COLOR: Record<string, string> = { info: "text-info", success: "text-success", warning: "text-warning", error: "text-destructive", progress: "text-muted-foreground" };

	let swipe = $state<Record<string, number>>({});
	function down(e: PointerEvent, t: Toast) {
		if ((e.target as HTMLElement).closest("button")) return;
		const sx = e.clientX;
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture(e.pointerId);
		const move = (ev: PointerEvent) => (swipe[t.item.id] = ev.clientX - sx);
		const up = () => {
			el.removeEventListener("pointermove", move);
			el.removeEventListener("pointerup", up);
			if (Math.abs(swipe[t.item.id] ?? 0) > 80) notify.dismiss(t.item.id);
			delete swipe[t.item.id];
		};
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerup", up);
	}
	function md(s?: string) {
		// small Markdown subset: **bold**, *italic*, `code`
		return (s ?? "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
			.replace(/\*(.+?)\*/g, "<i>$1</i>")
			.replace(/`(.+?)`/g, "<code>$1</code>");
	}
</script>

<section
	aria-label="Notifications"
	data-fw-region="toasts"
	class="pointer-events-none fixed z-[80] flex w-[min(380px,calc(100%-24px))] flex-col gap-2 {position.includes('top') ? 'top-12' : 'bottom-9'} {position.includes('left') ? 'left-3' : 'right-3'}"
	onpointerenter={() => notify.pause(true)}
	onpointerleave={() => notify.pause(false)}
	onfocusin={() => notify.pause(true)}
	onfocusout={() => notify.pause(false)}
>
	{#if hidden}
		<button class="pointer-events-auto self-end rounded-full border border-border bg-popover px-2 py-0.5 text-[11px] shadow" onclick={() => (notify.centerOpen = true)}>+{hidden} more</button>
	{/if}
	{#each visible as t (t.item.id)}
		<div
			role={t.item.kind === "error" ? "alert" : "status"}
			aria-live={t.item.kind === "error" ? "assertive" : "polite"}
			class="pointer-events-auto flex flex-col gap-1.5 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg transition-transform"
			style:transform="translateX({swipe[t.item.id] ?? 0}px)"
			style:opacity={1 - Math.min(0.8, Math.abs(swipe[t.item.id] ?? 0) / 200)}
			onpointerdown={(e) => down(e, t)}
		>
			<div class="flex items-start gap-2">
				<Icon name={t.item.icon ?? ICON[t.item.kind]} size={16} class="mt-0.5 {COLOR[t.item.kind]} {t.item.kind === 'progress' && !t.item.progress?.done ? 'animate-spin' : ''}" />
				<div class="min-w-0 flex-1">
					<div class="text-[13px] font-medium break-words">
						{t.item.title}
						{#if t.item.count > 1}<span class="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">x{t.item.count}</span>{/if}
					</div>
					{#if t.item.body}<div class="mt-0.5 text-xs break-words text-muted-foreground">{@html md(t.item.body)}</div>{/if}
				</div>
				<button class="fw-icon-btn -mt-1 -mr-1" aria-label="Dismiss" onclick={() => notify.dismiss(t.item.id)}><Icon name="x" size={14} /></button>
			</div>
			{#if t.item.progress}
				<div class="flex items-center gap-2">
					<div class="h-1.5 flex-1 overflow-hidden rounded bg-muted">
						{#if t.item.progress.fraction === null}
							<div class="h-full w-1/3 animate-pulse bg-primary"></div>
						{:else}
							<div class="h-full bg-primary transition-all" style:width="{t.item.progress.fraction * 100}%"></div>
						{/if}
					</div>
					{#if t.item.progress.cancellable}<button class="fw-btn h-6" onclick={() => notify.cancel(t.item.id)}>Cancel</button>{/if}
				</div>
				{#if t.item.progress.message}<div class="truncate text-[11px] text-muted-foreground">{t.item.progress.message}</div>{/if}
			{/if}
			{#if t.item.actions.length}
				<div class="flex flex-wrap justify-end gap-1.5">
					{#each t.item.actions as a, i (i)}
						<button class="fw-btn h-6 {a.primary ? 'fw-btn-primary' : ''}" onclick={() => notify.act(t.item, a)}>{a.label}</button>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</section>
