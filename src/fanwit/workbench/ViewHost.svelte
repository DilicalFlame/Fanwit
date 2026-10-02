<script lang="ts">
	/**
	 * Hosts one pane's view: loads the component lazily, renders loading and error states, and
	 * isolates crashes in an error boundary so one view never blanks the window.
	 */
	import type { Component } from "svelte";
	import { getKernel } from "../ui.svelte";
	import ErrorCard from "./ErrorCard.svelte";
	import EmptyState from "./EmptyState.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import { ctxkeys } from "../kernel/context.svelte";

	let { paneId }: { paneId: string } = $props();
	const k = getKernel();
	const layout = k.sys.layout;
	const pane = $derived(layout.doc.pane[paneId]);
	const view = $derived(pane ? (void layout.viewsVersion, layout.views.get(pane.view)) : undefined);

	let comp = $state<Component<any> | null>(null);
	let loadError = $state<unknown>(null);
	let attempt = $state(0);

	$effect(() => {
		const v = view;
		void attempt;
		comp = null;
		loadError = null;
		if (!v) return;
		const c = v.component as unknown;
		// loaders take no arguments; Svelte components take (anchor, props)
		const isLoader = typeof c === "function" && (c as { length: number }).length === 0;
		if (!isLoader) {
			comp = c as Component<any>;
			return;
		}
		(c as () => Promise<{ default: Component<any> }>)()
			.then((m) => {
				if (view === v) comp = m.default;
			})
			.catch((e) => (loadError = e));
		void k.modules.fire(`onView:${v.id}`);
	});

	const ctx = $derived(view ? (k.modules.modules.get(view.owner)?.ctx ?? null) : null);
</script>

<div class="relative flex min-h-0 flex-1 flex-col" use:ctxkeys={{ focusedView: pane?.view, "pane.id": paneId, "history.scope": `pane:${paneId}` }}>
	{#if !pane}
		<!-- pane removed -->
	{:else if !view}
		<EmptyState icon="circle-help" title="Unknown view" description={`No module provides "${pane.view}". It may belong to a disabled plugin.`} />
	{:else if loadError}
		<ErrorCard error={loadError} title="This view could not be loaded" reset={() => attempt++} />
	{:else if !comp}
		<div class="flex flex-col gap-2 p-3"><Skeleton class="h-4 w-1/2" /><Skeleton class="h-4 w-3/4" /><Skeleton class="h-4 w-2/3" /></div>
	{:else}
		{@const C = comp}
		<svelte:boundary>
			<C {paneId} props={pane.props ?? {}} {ctx} kernel={k} />
			{#snippet failed(error, reset)}
				<ErrorCard {error} reset={() => { attempt++; reset(); }} />
			{/snippet}
		</svelte:boundary>
	{/if}
</div>
