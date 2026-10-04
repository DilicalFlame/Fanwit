<script lang="ts">
	import type { Snippet } from "svelte";
	import { glossary } from "virtual:fw-docs";
	import { getKernel } from "../../ui.svelte";
	import { manualState } from "../state.svelte";
	import { render } from "../markdown";
	import { slug } from "../links.mjs";

	/**
	 * `<Term name="vault">vaults</Term>`: a glossary word, underlined, with its definition on hover
	 * or focus. Definitions come from `docs/<set>/glossary.toml`.
	 */
	let { name, children }: { name: string; children?: Snippet } = $props();
	const k = getKernel();
	const st = manualState(k);
	const found = $derived.by(() => {
		const n = name.toLowerCase();
		for (const [set, terms] of Object.entries(glossary)) {
			const t = terms.find((x) => x.name.toLowerCase() === n || x.aka.some((a) => a.toLowerCase() === n));
			if (t) return { set, t };
		}
		return null;
	});
</script>

{#if found}
	<span class="fw-term"><button type="button" class="fw-term-word" onclick={() => st.open(`${found.set}/reference/glossary#${slug(found.t.name)}`)}>{#if children}{@render children()}{:else}{name}{/if}</button><span class="fw-term-card" role="tooltip"><strong>{found.t.name}</strong>{@html render(found.t.text).html}</span></span>
{:else}
	{#if children}{@render children()}{:else}{name}{/if}
{/if}
