<script lang="ts">
	import Icon from "../icons/Icon.svelte";
	import { getKernel } from "../ui.svelte";
	import { toFanwitError } from "../kernel/errors";

	/** Recoverable error card: what happened, why if known, and actions (Section 18.7). */
	let { error, title = "This view crashed", reset }: { error: unknown; title?: string; reset?: () => void } = $props();
	const k = getKernel();
	const e = $derived(toFanwitError(error));
	const details = $derived(`${e.code}: ${e.message}${e.hint ? "\n" + e.hint : ""}${error instanceof Error && error.stack ? "\n\n" + error.stack : ""}`);
</script>

<div role="alert" class="m-3 flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
	<div class="flex items-center gap-2 font-medium text-destructive"><Icon name="triangle-alert" /> {title}</div>
	<div class="selectable text-foreground/90">{e.message}</div>
	{#if e.hint}<div class="text-xs text-muted-foreground">{e.hint}</div>{/if}
	<div class="mt-1 flex flex-wrap gap-2">
		{#if reset}<button class="fw-btn" onclick={reset}>Reload view</button>{/if}
		<button class="fw-btn" onclick={() => navigator.clipboard.writeText(details)}>Copy details</button>
		<button class="fw-btn" onclick={() => k.commands.run("dev.logs")}>Open logs</button>
		{#if e.docs}<button class="fw-btn" onclick={() => k.commands.run("manual.open", { page: e.docs })}>Open docs</button>{/if}
	</div>
</div>
