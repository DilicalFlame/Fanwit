<script lang="ts">
	import Icon from "../../icons/Icon.svelte";

	/**
	 * A whole repository file in a page, written as `<Source path="..." />` (source.mjs turns it into
	 * this). Folded by default; its highlighted code loads when opened, so long files cost nothing
	 * until a reader wants them. Copy and the code block's own Copy button both copy the file.
	 */
	let { path, lines, open = false, load }: { path: string; lines: number; open?: boolean; load: () => Promise<{ default: string }> } = $props();
	let html = $state<string | null>(null);
	let failed = $state(false);
	let expanded = $state(false);

	$effect(() => {
		if (open) expanded = true;
	});
	$effect(() => {
		if (!expanded || html !== null) return;
		load()
			.then((m) => (html = m.default))
			.catch(() => (failed = true));
	});
</script>

<details class="fw-source" bind:open={expanded}>
	<summary>
		<Icon name="file-code" size={14} />
		<code>{path}</code>
		<span class="fw-source-meta">{lines} lines</span>
	</summary>
	{#if failed}
		<p class="fw-source-missing">This file could not be loaded.</p>
	{:else if html === null}
		<p class="fw-source-loading">Loading…</p>
	{:else}
		{@html html}
	{/if}
</details>
