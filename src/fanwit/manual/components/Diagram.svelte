<script lang="ts">
	import type { Snippet } from "svelte";
	import Icon from "../../icons/Icon.svelte";
	import { reduced } from "../../motion/motion";

	/**
	 * A diagram you step through. Put an SVG (or any markup) inside and mark its parts with
	 * `data-step="2"` (several: `data-step="2 3"`); each step lights its parts and shows its text.
	 * Colours come from the theme: use `currentColor`, `var(--primary)`, `var(--muted)`.
	 *
	 *   <Diagram title="..." steps={[{ title: "Input", text: "..." }, ...]}> <svg>...</svg> </Diagram>
	 */
	let { title, steps = [], children }: { title?: string; steps?: { title: string; text: string }[]; children?: Snippet } = $props();
	let i = $state(0);
	let playing = $state(false);
	let canvas = $state<HTMLElement>();
	const step = $derived(steps[i]);

	$effect(() => {
		const n = i + 1;
		for (const el of canvas?.querySelectorAll<SVGElement | HTMLElement>("[data-step]") ?? []) {
			const at = (el.dataset.step ?? "").split(/\s+/).map(Number);
			el.classList.toggle("on", at.includes(n));
			el.classList.toggle("done", !at.includes(n) && Math.min(...at) < n);
		}
	});
	$effect(() => {
		if (!playing) return;
		const t = setInterval(() => {
			if (i >= steps.length - 1) playing = false;
			else i++;
		}, 2600);
		return () => clearInterval(t);
	});
	const go = (n: number) => {
		playing = false;
		i = Math.max(0, Math.min(steps.length - 1, n));
	};
	function key(e: KeyboardEvent) {
		if (e.key === "ArrowRight") go(i + 1);
		else if (e.key === "ArrowLeft") go(i - 1);
		else return;
		e.preventDefault();
	}
</script>

<figure class="fw-diagram" aria-label={title}>
	<div class="fw-diagram-canvas" bind:this={canvas} data-steps={steps.length || undefined}>{@render children?.()}</div>
	{#if steps.length}
		<figcaption>
			<div class="fw-diagram-controls" role="toolbar" aria-label="Steps" tabindex="0" onkeydown={key}>
				<button type="button" class="fw-icon-btn" aria-label="Previous step" disabled={i === 0} onclick={() => go(i - 1)}><Icon name="chevron-left" size={15} /></button>
				{#if !reduced()}
					<button type="button" class="fw-icon-btn" aria-label={playing ? "Pause" : "Play every step"} onclick={() => (playing ? (playing = false) : ((i = i >= steps.length - 1 ? 0 : i), (playing = true)))}><Icon name={playing ? "pause" : "play"} size={14} /></button>
				{/if}
				<button type="button" class="fw-icon-btn" aria-label="Next step" disabled={i === steps.length - 1} onclick={() => go(i + 1)}><Icon name="chevron-right" size={15} /></button>
				<span class="fw-diagram-dots">
					{#each steps as s, n (n)}<button type="button" aria-label="Step {n + 1}: {s.title}" aria-current={n === i ? "step" : undefined} onclick={() => go(n)}></button>{/each}
				</span>
				<span class="fw-diagram-count">{i + 1} / {steps.length}</span>
			</div>
			<div class="fw-diagram-text" aria-live="polite"><strong>{step?.title}</strong> {step?.text}</div>
		</figcaption>
	{:else if title}
		<figcaption><div class="fw-diagram-text">{title}</div></figcaption>
	{/if}
</figure>
