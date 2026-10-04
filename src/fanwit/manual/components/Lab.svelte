<script lang="ts" module>
	/** What a playground inside a lab reports: the text its output shows now. */
	export const LAB = Symbol("fw-lab");
	export interface LabReporter {
		report(output: string): void;
	}
</script>

<script lang="ts">
	import { setContext, type Snippet } from "svelte";
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import { haptic } from "../../motion/motion";
	import { manualState } from "../state.svelte";

	/**
	 * A lab: a goal, steps, and a playground to reach it in.
	 *
	 *   <Lab id="count-down" title="Make it count down" expect="-1">
	 *
	 *   The goal and steps (Markdown), then a <Playground>.
	 *
	 *   </Lab>
	 *
	 * With `expect`, the lab completes by itself when the playground's output (a Svelte preview's
	 * text, a program's output, a sandbox's trace) contains that text; without it, the reader marks
	 * it done. Completed labs are remembered.
	 */
	let { id, title, expect, children }: { id: string; title: string; expect?: string; children?: Snippet } = $props();
	const st = manualState(getKernel());
	const done = $derived(st.labs.has(id));

	setContext<LabReporter>(LAB, {
		report(output) {
			if (expect && !st.labs.has(id) && output.includes(expect)) {
				st.markLab(id);
				haptic("success");
			}
		}
	});
</script>

<section class="fw-lab" class:done aria-labelledby="lab-{id}">
	<header class="fw-lab-head">
		<Icon name="flask-conical" size={15} />
		<span class="fw-lab-kind">Lab</span>
		<span id="lab-{id}" class="fw-lab-title">{title}</span>
		<span class="fw-lab-status" role="status">{#if done}<Icon name="circle-check" size={14} />Done{:else}Not done yet{/if}</span>
	</header>
	<div class="fw-lab-body">{@render children?.()}</div>
	<footer class="fw-lab-foot">
		{#if expect}
			<span>{done ? "You got it." : "This lab checks itself: it is done when the output shows"} {#if !done}<code>{expect}</code>{/if}</span>
		{/if}
		{#if done}
			<button type="button" class="fw-play-btn" onclick={() => st.markLab(id, false)}>Do it again</button>
		{:else if !expect}
			<button type="button" class="fw-play-btn primary" onclick={() => st.markLab(id)}><Icon name="check" size={12} />Mark as done</button>
		{/if}
	</footer>
</section>
