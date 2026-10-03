<script lang="ts">
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import { Button } from "$lib/components/ui/button";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import { useInstaller } from "../installer.svelte";
	const inst = useInstaller();
	let launch = $state(true);

	async function finish() {
		if (launch) await inst.launch();
		if (!inst.error) void getCurrentWindow().close();
	}
</script>

<div class="flex h-full flex-col items-center justify-center pb-6 text-center">
	<CircleCheck class="size-14 text-success" />
	<h1 class="mt-4 text-2xl font-semibold">{inst.info!.app.name} is ready</h1>
	<p class="mt-2 max-w-sm text-sm text-muted-foreground">
		{inst.result === 3010 ? "Restart your computer to finish setting up." : `${inst.info!.app.name} ${inst.info!.app.version} was installed${inst.info!.simulated ? " on the simulated machine" : ""}.`}
	</p>
	<label class="mt-6 flex items-center gap-2 text-sm"><Checkbox bind:checked={launch} /> Launch {inst.info!.app.name} now</label>
	<Button class="mt-5" onclick={finish}>Finish</Button>
	{#if inst.error}<p class="mt-3 text-xs text-destructive">{inst.error}</p>{/if}
</div>
