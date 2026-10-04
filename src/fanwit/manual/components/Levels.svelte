<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import { manualState } from "../state.svelte";
	import { docsets, levelOf, ordered } from "../docs";

	/**
	 * `<Levels />`: one card per reading level of this docset (docset.toml [[levels]]) with its
	 * pages, how many you have read, and where to continue.
	 */
	let { set = "fanwit" }: { set?: string } = $props();
	const k = getKernel();
	const st = manualState(k);
	const docset = $derived(docsets.find((s) => s.id === set));
	const levels = $derived(
		(docset?.levels ?? []).map((l) => ({ ...l, pages: ordered(st.pages.filter((p) => p.set === set && p.kind === "manual" && levelOf(docset, p.section) === l.id), docset) }))
	);

	function go(level: string, key: string | undefined) {
		st.setLevel(level);
		if (key) st.open(key);
	}
</script>

<div class="fw-levels fw-widget">
	{#each levels as l (l.id)}
		{@const n = l.pages.filter((p) => st.read.has(p.key)).length}
		{@const next = l.pages.find((p) => !st.read.has(p.key))}
		<section class="fw-path" aria-labelledby="level-{l.id}">
			<h2 id="level-{l.id}">{l.title}</h2>
			<p class="fw-path-meta">{l.pages.length ? `${l.pages.length} page${l.pages.length === 1 ? "" : "s"} · ${n === l.pages.length ? "done" : `${n} of ${l.pages.length} read`}` : "Being written"}</p>
			{#if l.pages.length}
				<div class="fw-path-bar" role="progressbar" aria-valuemin={0} aria-valuemax={l.pages.length} aria-valuenow={n} aria-label="{l.title} progress"><span style:width="{(n / l.pages.length) * 100}%"></span></div>
			{/if}
			{#if l.summary}<p>{l.summary}</p>{/if}
			<p class="fw-path-meta">{l.sections.join(" · ")}</p>
			<button type="button" class="fw-path-go" onclick={() => go(l.id, (next ?? l.pages[0])?.key)}>{n === 0 ? "Start" : next ? `Continue: ${next.title}` : "Read it again"}<Icon name="arrow-right" size={14} /></button>
		</section>
	{/each}
</div>
