<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import { manualState } from "../state.svelte";
	import { render } from "../markdown";

	/**
	 * `<Api symbol="defineModule" />` or `symbol="FanwitError.hint"`: an API name in the text, with
	 * its signature and summary on hover (read from the TypeDoc reference) and a link to its page.
	 */
	let { symbol }: { symbol: string } = $props();
	const k = getKernel();
	const st = manualState(k);
	const [name, member] = $derived(symbol.split("."));
	const hit = $derived.by(() => {
		for (const [set, list] of Object.entries(st.api)) {
			const s = list.find((x) => x.name === name);
			if (s) return { set, s, m: member ? s.members.find((x) => x.name === member) : undefined };
		}
		return null;
	});
	const show = () => void st.loadApi();
	const open = () => {
		const page = hit ? `${hit.set}/${hit.s.id}` : `api/${name}`;
		st.open(member ? `${page}#${member.toLowerCase()}` : page);
	};
</script>

<!-- no whitespace around the word: it sits inside a sentence -->
<span class="fw-term" onpointerenter={show} onfocusin={show} role="presentation"><button type="button" class="fw-api-ref" onclick={open}><code>{symbol}</code></button><span class="fw-term-card fw-api-card" role="tooltip">
		{#if hit}
			{@const d = hit.m ?? hit.s}
			<code class="fw-api-card-sig">{d.signature[0]}</code>
			{#if d.summary}{@html render(d.summary).html}{:else}<em>Not documented yet.</em>{/if}
		{:else if st.apiState === "loading" || st.apiState === "idle"}
			<em>Reading the API…</em>
		{:else}
			<em>{symbol} is not in the API reference.</em>
		{/if}
	</span></span>
