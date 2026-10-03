<script lang="ts">
	import { onMount } from "svelte";
	import Workbench from "$fanwit/workbench/Workbench.svelte";
	import { getKernel } from "$fanwit/ui.svelte";
	import { mainStartup } from "$fanwit/startup.svelte";

	/** The main window: the workbench frame with the workspace layout. */
	const k = getKernel();
	onMount(() => void mainStartup(k));
</script>

<Workbench windowId="main" />
