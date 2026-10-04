<script lang="ts">
	import Art from "./Art.svelte";

	let { props }: { props: { seed?: number } } = $props();
</script>

<div class="flex h-full w-full items-center justify-center bg-black p-2">
	<Art seed={props.seed ?? 0} class="aspect-[4/3] max-h-[70vh] w-[min(80vw,900px)] rounded" />
</div>
