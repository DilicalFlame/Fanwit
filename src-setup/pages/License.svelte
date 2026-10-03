<script lang="ts">
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { render } from "$fanwit/manual/markdown";
	import { useInstaller } from "../installer.svelte";
	const inst = useInstaller();
</script>

<h1 class="text-xl font-semibold">Licence agreement</h1>
<p class="mt-1 text-sm text-muted-foreground">Please read the licence before installing.</p>
<div class="mt-4 h-64 overflow-y-auto rounded-lg border border-border bg-card p-4 text-sm select-text">
	{@html render(inst.info!.license).html}
</div>
<label class="mt-4 flex items-center gap-2 text-sm">
	<Checkbox bind:checked={inst.licenseAccepted} />
	I accept the licence agreement
</label>
