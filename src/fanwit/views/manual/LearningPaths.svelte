<script lang="ts">
	import { paths } from "virtual:fw-docs";
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import { manualState } from "../../manual/state.svelte";
	import { titleOf } from "../../manual/docs";

	/** A docset's learning paths, with how far you are in each and where to continue. */
	let { set }: { set: string } = $props();
	const k = getKernel();
	const st = manualState(k);
	const list = $derived(paths[set] ?? []);
	const done = (pages: string[]) => pages.filter((p) => st.read.has(p)).length;
</script>

<h1>Learning paths</h1>
<p>Each path is an order to read the manual in, for one goal. Pages you read to the end are ticked off here and in the contents, and each page in a path links to the next one.</p>

{#each list as p (p.id)}
	{@const n = done(p.pages)}
	{@const next = p.pages.find((x) => !st.read.has(x))}
	<section class="fw-path" aria-labelledby="path-{p.id}">
		<h2 id="path-{p.id}">{p.title}</h2>
		<p class="fw-path-meta">{p.pages.length} pages{p.minutes ? ` · about ${p.minutes} minutes` : ""} · {n === p.pages.length ? "done" : `${n} of ${p.pages.length} read`}</p>
		<div class="fw-path-bar" role="progressbar" aria-valuemin={0} aria-valuemax={p.pages.length} aria-valuenow={n} aria-label="{p.title} progress"><span style:width="{(n / p.pages.length) * 100}%"></span></div>
		<p>{p.description}</p>
		<ol class="fw-path-steps">
			{#each p.pages as key (key)}
				<li class:read={st.read.has(key)}>
					<button type="button" onclick={() => st.open(key)}><Icon name={st.read.has(key) ? "circle-check" : "circle"} size={14} />{titleOf(key)}</button>
				</li>
			{/each}
		</ol>
		<button type="button" class="fw-path-go" onclick={() => st.open(next ?? p.pages[0])}>{n === 0 ? "Start" : next ? `Continue: ${titleOf(next)}` : "Read it again"}<Icon name="arrow-right" size={14} /></button>
	</section>
{/each}
