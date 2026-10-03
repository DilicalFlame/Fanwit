<script lang="ts">
	import "./layout.css";
	import { onMount, setContext, type Snippet } from "svelte";
	import { page } from "$app/state";
	import { boot } from "$fanwit/boot.svelte";
	import { afterFirstPaint } from "$fanwit/startup.svelte";
	import { KERNEL_KEY } from "$fanwit/ui.svelte";
	import type { Kernel } from "$fanwit/kernel/kernel.svelte";

	/** Boots the kernel once per window (Section 3.5), then renders the window's route. */
	let { children }: { children: Snippet } = $props();
	let kernel = $state<Kernel | null>(null);
	let error = $state<string | null>(null);
	const holder: { k: Kernel | null } = { k: null };
	setContext(KERNEL_KEY, new Proxy({} as Kernel, { get: (_t, key) => (holder.k as unknown as Record<string | symbol, unknown>)[key] }));

	onMount(async () => {
		try {
			const kind = page.url.pathname.startsWith("/w/") ? page.url.pathname.split("/")[2] || "main" : "main";
			const layoutWindow = kind === "view" ? (page.url.searchParams.get("window") ?? "main") : "main";
			const k = await boot({ windowKind: kind, layoutWindow });
			holder.k = k;
			kernel = k;
			void afterFirstPaint(k);
		} catch (e) {
			error = String((e as Error)?.stack ?? e);
			console.error(e);
		}
	});
</script>

<svelte:head>
	<link rel="icon" href="/favicon.svg" />
</svelte:head>

{#if kernel}
	{@render children()}
{:else if error}
	<div class="flex h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
		<h1 class="text-lg font-semibold">The app could not start</h1>
		<pre class="selectable max-h-80 max-w-3xl overflow-auto rounded-md bg-muted p-3 text-left text-xs">{error}</pre>
		<button class="fw-btn" onclick={() => location.reload()}>Reload</button>
	</div>
{/if}
