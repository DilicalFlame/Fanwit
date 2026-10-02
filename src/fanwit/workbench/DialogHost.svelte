<script lang="ts">
	import { onMount, tick } from "svelte";
	import { getKernel } from "../ui.svelte";
	import { setDialogPresenter } from "../host/browser";
	import Icon from "../icons/Icon.svelte";

	/**
	 * Styled in page dialogs for the web host (Section 9.9), with buttons ordered by platform
	 * convention: declare primary and cancel roles, never positions (Section 18.11).
	 */
	const k = getKernel();
	let current = $state<{ message: string; title?: string; kind?: string; ok: string; cancel?: string; resolve: (v: boolean) => void } | null>(null);
	let okBtn = $state<HTMLButtonElement>();
	const primaryFirst = k.host.platform === "windows";

	onMount(() => {
		if (k.host.kind !== "browser") return;
		setDialogPresenter({
			ask: (message, o) =>
				new Promise((resolve) => {
					current = { message, title: o.title, kind: o.kind, ok: o.okLabel ?? "OK", cancel: o.cancelLabel ?? "Cancel", resolve };
					void tick().then(() => okBtn?.focus());
				}),
			message: (message, o) =>
				new Promise((resolve) => {
					current = { message, title: o.title, kind: o.kind, ok: "OK", resolve: () => resolve() };
					void tick().then(() => okBtn?.focus());
				})
		});
		return () => setDialogPresenter(null);
	});

	function done(v: boolean) {
		const c = current;
		current = null;
		c?.resolve(v);
	}
</script>

{#if current}
	<div class="fixed inset-0 z-[120] flex items-center justify-center bg-black/40" role="presentation">
		<div role="alertdialog" aria-modal="true" aria-labelledby="fw-dlg-title" aria-describedby="fw-dlg-msg" class="w-[min(440px,calc(100%-24px))] rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl" onkeydown={(e) => e.key === "Escape" && done(false)} tabindex="-1">
			<div class="flex items-start gap-3">
				<Icon name={current.kind === "warning" ? "triangle-alert" : current.kind === "error" ? "circle-x" : "info"} size={20} class={current.kind === "warning" ? "text-warning" : current.kind === "error" ? "text-destructive" : "text-info"} />
				<div class="min-w-0 flex-1">
					<h2 id="fw-dlg-title" class="text-sm font-semibold">{current.title ?? "Confirm"}</h2>
					<p id="fw-dlg-msg" class="mt-1 text-sm whitespace-pre-line text-muted-foreground">{current.message}</p>
				</div>
			</div>
			<div class="mt-5 flex justify-end gap-2" class:flex-row-reverse={primaryFirst}>
				{#if current.cancel}<button class="fw-btn" onclick={() => done(false)}>{current.cancel}</button>{/if}
				<button bind:this={okBtn} class="fw-btn {current.kind === 'warning' ? 'fw-btn-danger' : 'fw-btn-primary'}" onclick={() => done(true)}>{current.ok}</button>
			</div>
		</div>
	</div>
{/if}
