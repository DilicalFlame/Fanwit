<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";

	const k = getKernel();
	let name = $state("Asha");
</script>

<div class="flex flex-col gap-2 p-4">
	<h2 class="text-base font-semibold">Hello view</h2>
	<p class="text-sm text-muted-foreground">A lazily loaded view from the sample module in src/app/modules/hello.</p>
	<div class="flex gap-2">
		<input class="fw-input w-48" bind:value={name} aria-label="Name" />
		<button class="fw-btn fw-btn-primary" onclick={() => k.commands.run("hello.greet", { name })}>Greet</button>
	</div>
</div>
