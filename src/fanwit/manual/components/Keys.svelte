<script lang="ts">
	import { getKernel } from "../../ui.svelte";

	/**
	 * `<Keys command="palette.open" />`: the key a command is bound to right now (the user's own
	 * keys.toml included), so the manual never shows a stale shortcut. `keys="ctrl+k"` shows fixed keys.
	 */
	let { command, keys }: { command?: string; keys?: string } = $props();
	const k = getKernel();
	const label = $derived(command ? k.keys.label(command) : keys ? keys.split(/\s+/).map((c) => c.split("+").map((p) => p[0].toUpperCase() + p.slice(1)).join("+")) : null);
</script>

{#if label?.length}
	<span class="fw-keys" title={command ? `Bound to ${command}` : undefined}>{#each label as chord, i (i)}{#if i}<span class="fw-keys-then"> then </span>{/if}<kbd>{chord}</kbd>{/each}</span>
{:else}
	<span class="fw-keys fw-keys-none" title="Not bound to a key; run it from the palette">{command} (no key)</span>
{/if}
