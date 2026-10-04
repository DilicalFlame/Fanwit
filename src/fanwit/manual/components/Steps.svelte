<script lang="ts">
	import type { Snippet } from "svelte";

	/** `<Steps>` around an ordered list: numbered steps joined by a line. */
	let { children }: { children?: Snippet } = $props();
</script>

<div class="fw-steps">{@render children?.()}</div>
