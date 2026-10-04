<script lang="ts">
	import type { Snippet } from "svelte";

	/**
	 * `<FileTree>` around a nested list: a folder tree. Items ending in "/" or with children are
	 * folders; text after the name (after two spaces or a dash) is a comment.
	 */
	let { children }: { children?: Snippet } = $props();
	let el = $state<HTMLElement>();
	$effect(() => {
		for (const li of el?.querySelectorAll("li") ?? []) {
			const name = li.firstChild?.textContent?.trim() ?? "";
			li.classList.toggle("folder", name.endsWith("/") || !!li.querySelector(":scope > ul"));
		}
	});
</script>

<div class="fw-filetree" bind:this={el}>{@render children?.()}</div>
