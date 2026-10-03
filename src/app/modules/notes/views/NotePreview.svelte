<script lang="ts">
	import { onDestroy } from "svelte";
	import { getKernel } from "$fanwit/ui.svelte";
	import { render } from "$fanwit/manual/markdown";

	/** Live preview that follows the editor through notes:changed events. */
	let { props }: { props: { path?: string } } = $props();
	const k = getKernel();
	let text = $state("");
	$effect(() => {
		if (props.path && k.sys.vault.current) k.sys.vault.fs.readText(props.path).then((t) => (text = t)).catch(() => (text = "*Could not read the file.*"));
	});
	const d = k.events.on("notes:changed" as never, (m: { path: string; text: string }) => m.path === props.path && (text = m.text));
	onDestroy(() => d.dispose());
</script>

<article class="fw-prose selectable h-full overflow-auto px-8 py-6">{@html render(text).html}</article>
