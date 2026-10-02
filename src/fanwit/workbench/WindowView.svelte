<script lang="ts">
	import type { Component } from "svelte";
	import { getKernel } from "../ui.svelte";
	import { provideWindowSelf, type WindowSelf } from "../windows/windows.svelte";
	import ErrorCard from "./ErrorCard.svelte";
	import EmptyState from "./EmptyState.svelte";

	/** Renders a registered view as the root of a window (native or virtual) with useWindow(). */
	let { view, props = {}, self }: { view: string; props?: Record<string, unknown>; self: WindowSelf } = $props();
	const k = getKernel();
	provideWindowSelf(self);
	const v = $derived((void k.sys.layout.viewsVersion, k.sys.layout.views.get(view)));
	let comp = $state<Component<any> | null>(null);
	let err = $state<unknown>(null);
	$effect(() => {
		const c = v?.component as unknown;
		comp = null;
		err = null;
		if (!c) return;
		void k.modules.fire(`onView:${view}`);
		if (typeof c === "function" && (c as { length: number }).length === 0)
			(c as () => Promise<{ default: Component<any> }>)()
				.then((m) => (comp = m.default))
				.catch((e) => (err = e));
		else comp = c as Component<any>;
	});
	const ctx = $derived(v ? (k.modules.modules.get(v.owner)?.ctx ?? null) : null);
</script>

{#if !v}
	<EmptyState icon="circle-help" title="Unknown view" description={`No module provides "${view}".`} />
{:else if err}
	<ErrorCard error={err} />
{:else if comp}
	{@const C = comp}
	<svelte:boundary>
		<C paneId={null} {props} {ctx} kernel={k} window={self} />
		{#snippet failed(error, reset)}<ErrorCard {error} {reset} />{/snippet}
	</svelte:boundary>
{/if}
