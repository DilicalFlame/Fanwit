<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import Art from "./Art.svelte";

	/** Generated campaign images; click one to open it in a lightbox overlay (a layout action). */
	const k = getKernel();
	let offset = $state(0);
	const open = (seed: number) => k.sys.layout.dispatch({ type: "openOverlay", view: "showcase.dashboard.image", props: { seed }, variant: "lightbox", backdrop: "blur" });
</script>

<div class="flex h-full w-full flex-col gap-2 p-2">
	<div class="grid min-h-0 flex-1 grid-cols-3 gap-2">
		{#each { length: 6 } as _, i (i + offset)}
			<button class="group relative overflow-hidden rounded-md" aria-label="Open image {i + offset + 1}" onclick={() => open(i + offset)}>
				<Art seed={i + offset} class="size-full transition-transform duration-300 group-hover:scale-105" />
			</button>
		{/each}
	</div>
	<button class="fw-btn self-end text-xs" onclick={() => (offset += 6)}><Icon name="shuffle" size={13} />More images</button>
</div>
