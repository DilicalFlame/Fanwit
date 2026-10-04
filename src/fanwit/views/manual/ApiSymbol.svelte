<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import { render } from "../../manual/markdown";
	import type { ApiSymbol } from "../../manual/docs";
	import type { ApiMember } from "../../manual/api.mjs";

	/** An API reference page: signature, TSDoc summary, examples and members (from TypeDoc). */
	let { symbol }: { symbol: ApiSymbol } = $props();
	const k = getKernel();
	const md = (s: string) => render(s).html;
	const groups = $derived.by(() => {
		const m = new Map<string, ApiMember[]>();
		for (const x of symbol.members) m.set(x.kind, [...(m.get(x.kind) ?? []), x]);
		return [...m.entries()];
	});
	/** In development, open the declaration in the editor; elsewhere show where it lives. */
	function openSource(source: string) {
		const [file, line] = source.split(":");
		void k.commands.run("fanwit.openSource", { file, line: Number(line) || 1 }).catch(() => {});
	}
	const plural = (kind: string) => (kind.endsWith("y") ? kind.slice(0, -1) + "ies" : kind.endsWith("s") ? kind : kind + "s");
</script>

{#snippet item(m: ApiMember)}
	{#each m.signature as sig, i (i)}<pre class="fw-api-sig"><code>{sig}</code></pre>{/each}
	{#if m.deprecated}<p><strong>Deprecated.</strong> {m.deprecated}</p>{/if}
	{#if m.summary}{@html md(m.summary)}{:else}<p class="text-muted-foreground italic">Not documented yet.</p>{/if}
	{#each m.examples as ex, i (i)}{@html md(ex.includes("```") ? ex : "```ts\n" + ex + "\n```")}{/each}
	{#if m.see?.length}
		<p class="font-sans text-sm">See also: {#each m.see as href, i (i)}{#if i}, {/if}<a {href}>{href.replace(/^manual:\/\/(fanwit\/)?/, "").replace(/^(guides|reference)\//, "")}</a>{/each}</p>
	{/if}
	<p class="font-sans text-xs text-muted-foreground">
		{#if m.since}<span class="mr-2">Since {m.since}</span>{/if}
		{#if m.source}<button class="underline underline-offset-2 hover:text-foreground" title="Open the declaration" onclick={() => openSource(m.source!)}>{m.source}</button>{/if}
	</p>
{/snippet}

<h1>{symbol.name}</h1>
<p class="font-sans text-xs tracking-wide text-muted-foreground uppercase">{symbol.kind}</p>
{@render item(symbol)}
{#each groups as [kind, members] (kind)}
	<h2>{plural(kind[0].toUpperCase() + kind.slice(1))}</h2>
	{#each members as m (m.name)}
		<h3>{m.name}</h3>
		{@render item(m)}
	{/each}
{/each}
