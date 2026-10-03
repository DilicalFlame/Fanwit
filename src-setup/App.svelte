<script lang="ts">
	import Check from "@lucide/svelte/icons/check";
	import FlaskConical from "@lucide/svelte/icons/flask-conical";
	import { Button } from "$lib/components/ui/button";
	import { attachPress, enter } from "$fanwit/motion/motion";
	import { onMount } from "svelte";
	import { Installer, provideInstaller } from "./installer.svelte";
	import { applyTheme } from "./theme";
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import "./pages/custom";

	const inst = new Installer();
	provideInstaller(inst);

	onMount(() => {
		void inst.load().then(() => inst.info && applyTheme(inst.info.installer.theme || "fanwit-default"));
		return attachPress();
	});

	const oneClick = $derived(inst.info?.installer.preset === "one-click");
	const last = $derived(inst.index === inst.pages.length - 1);
	const nextLabel = $derived(inst.page?.id === "summary" ? "Install" : inst.page?.id === "finish" ? "Close" : "Next");

	const close = () => void getCurrentWindow().close();
	const failed = $derived(inst.result !== null && inst.result !== 0 && inst.result !== 3010);

	function onNext() {
		if (inst.page?.id === "finish" || (inst.page?.id === "progress" && failed)) return close();
		inst.next();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement) && inst.canNext && !inst.installing) onNext();
	}
</script>

<svelte:window onkeydown={onKey} />

{#if inst.error && !inst.info}
	<div class="grid h-full place-items-center bg-background p-10 text-center text-foreground">
		<div>
			<h1 class="text-lg font-semibold">Setup could not start</h1>
			<p class="mt-2 text-muted-foreground">{inst.error}</p>
		</div>
	</div>
{:else if !inst.info}
	<div class="h-full bg-background"></div>
{:else if oneClick && inst.mode === "install"}
	<!-- one-click preset: a single themed screen (Figure 16.6, 4) -->
	{#await import("./pages/Progress.svelte") then P}
		<div class="flex h-full flex-col justify-center bg-background p-12 text-foreground"><P.default compact /></div>
	{/await}
{:else}
	<div class="flex h-full bg-background text-foreground">
		<aside class="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-5 text-sidebar-foreground">
			<div class="flex items-center gap-3" use:enter={"fade"}>
				<div class="grid size-10 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">{inst.info.app.name[0]}</div>
				<div class="min-w-0">
					<div class="truncate font-semibold">{inst.info.app.name}</div>
					<div class="text-xs text-muted-foreground">Version {inst.info.app.version}</div>
				</div>
			</div>
			<!-- step rail: completed pages are clickable (Figure 16.5, 1) -->
			<nav class="mt-8 flex flex-col gap-0.5" aria-label="Setup steps">
				{#each inst.pages as p, i (p.id)}
					{@const done = i < inst.index}
					{@const current = i === inst.index}
					<button
						class="flex items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors disabled:cursor-default {current ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : done ? 'text-sidebar-foreground hover:bg-sidebar-accent/60' : 'text-muted-foreground'}"
						disabled={!done || inst.installing || inst.page?.id === "finish" || inst.page?.id === "progress"}
						aria-current={current ? "step" : undefined}
						onclick={() => inst.go(i)}
						data-no-press
					>
						<span class="grid size-5 shrink-0 place-items-center rounded-full border text-[10px] {done ? 'border-primary bg-primary text-primary-foreground' : current ? 'border-primary text-foreground' : 'border-border'}">
							{#if done}<Check class="size-3" />{:else}{i + 1}{/if}
						</span>
						{p.title}
					</button>
				{/each}
			</nav>
			<div class="mt-auto space-y-2">
				{#if inst.info.simulated}
					<div class="flex items-center gap-2 rounded-md bg-warning/15 px-2 py-1.5 text-xs text-warning" title="FW_SETUP_SCENARIO is set: nothing on this computer changes">
						<FlaskConical class="size-3.5" /> Simulated machine
					</div>
				{/if}
				<div class="text-[11px] text-muted-foreground">Powered by Fanwit Installer Kit</div>
			</div>
		</aside>

		<main class="flex min-w-0 flex-1 flex-col">
			<section class="min-h-0 flex-1 overflow-y-auto px-9 pt-8 pb-4">
				{#if inst.page}
					{#key inst.page.id + inst.mode}
						<div use:enter={"rise"}>
							{#await inst.page.component() then P}
								<P.default />
							{:catch e}
								<p class="text-sm text-destructive">This page could not load: {e}</p>
							{/await}
						</div>
					{/key}
				{/if}
			</section>
			{#if inst.mode === "install" && inst.page?.id !== "finish"}
				<footer class="flex items-center gap-2 border-t border-border px-9 py-4">
					{#if inst.installing}
						<Button variant="ghost" onclick={() => inst.cancel()} disabled={inst.cancelling}>{inst.cancelling ? "Cancelling…" : "Cancel"}</Button>
					{:else if inst.page?.id !== "finish" && inst.page?.id !== "progress"}
						<Button variant="ghost" onclick={close}>Cancel</Button>
					{/if}
					<div class="flex-1"></div>
					{#if inst.index > 0 && inst.page?.id !== "progress" && inst.page?.id !== "finish"}
						<Button variant="outline" onclick={inst.back}>Back</Button>
					{/if}
					{#if inst.page?.id !== "progress" || inst.result !== null}
						<Button onclick={onNext} disabled={!inst.canNext && !(inst.page?.id === "progress" && inst.result !== null)}>{last || (inst.page?.id === "progress" && failed) ? "Close" : nextLabel}</Button>
					{/if}
				</footer>
			{/if}
		</main>
	</div>
{/if}
