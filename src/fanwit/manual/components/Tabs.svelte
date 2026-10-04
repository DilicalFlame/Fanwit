<script lang="ts" module>
	/** Tabs with the same labels switch together across the page (pick TypeScript once). */
	const chosen = $state<Record<string, number>>({});
</script>

<script lang="ts">
	import type { Snippet } from "svelte";

	/**
	 * `<Tabs labels="TypeScript, TOML">` followed by one block per label (code blocks or
	 * paragraphs): shows one at a time.
	 */
	let { labels, children }: { labels: string; children?: Snippet } = $props();
	const names = $derived(labels.split(",").map((s) => s.trim()));
	const group = $derived(names.join("|"));
	const KEY = "fw-manual-tabs";
	const index = $derived(Math.min(chosen[group] ?? remembered(group), names.length - 1));
	let body = $state<HTMLElement>();
	const id = `fw-tabs-${Math.random().toString(36).slice(2, 8)}`;

	function remembered(g: string): number {
		try {
			return JSON.parse(localStorage.getItem(KEY) ?? "{}")[g] ?? 0;
		} catch {
			return 0;
		}
	}
	function pick(i: number) {
		chosen[group] = i;
		try {
			localStorage.setItem(KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(KEY) ?? "{}"), [group]: i }));
		} catch {
			/* storage unavailable */
		}
	}
	$effect(() => {
		[...(body?.children ?? [])].forEach((c, i) => ((c as HTMLElement).hidden = i !== index));
	});
	function key(e: KeyboardEvent) {
		if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
		pick((index + (e.key === "ArrowRight" ? 1 : names.length - 1)) % names.length);
		(e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[aria-selected="true"]`)?.focus();
	}
</script>

<div class="fw-tabs">
	<div class="fw-tabs-list" role="tablist" tabindex="-1" onkeydown={key}>
		{#each names as n, i (n)}
			<button role="tab" id="{id}-{i}" aria-selected={i === index} aria-controls="{id}-panel" tabindex={i === index ? 0 : -1} onclick={() => pick(i)}>{n}</button>
		{/each}
	</div>
	<div class="fw-tabs-body" id="{id}-panel" role="tabpanel" aria-labelledby="{id}-{index}" bind:this={body}>{@render children?.()}</div>
</div>
