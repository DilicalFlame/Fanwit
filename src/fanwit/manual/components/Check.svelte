<script lang="ts">
	import type { Snippet } from "svelte";

	/**
	 * A quick check of understanding, answered in place:
	 *
	 *   <Check question="..." options={["...", "..."]} answer={1}>
	 *
	 *   Why that answer is right (Markdown, shown once answered).
	 *
	 *   </Check>
	 */
	let { question, options, answer, children }: { question: string; options: string[]; answer: number; children?: Snippet } = $props();
	let picked = $state<number | null>(null);
	const right = $derived(picked === answer);
</script>

<fieldset class="fw-check">
	<legend>Check your understanding</legend>
	<div class="fw-check-q">{question}</div>
	{#each options as o, i (i)}
		<button type="button" class="fw-check-opt" class:right={picked !== null && i === answer} class:wrong={picked === i && !right} disabled={picked !== null} aria-pressed={picked === i} onclick={() => (picked = i)}>
			<span aria-hidden="true">{picked !== null && i === answer ? "✓" : picked === i ? "✗" : String.fromCharCode(65 + i)}</span>{o}
		</button>
	{/each}
	{#if picked !== null}
		<div class="fw-check-why" role="status">
			<strong>{right ? "Right." : "Not quite."}</strong>
			{@render children?.()}
			{#if !right}<button type="button" class="underline" onclick={() => (picked = null)}>Try again</button>{/if}
		</div>
	{/if}
</fieldset>
