<script lang="ts">
	import { onDestroy } from "svelte";
	import { getKernel } from "../../ui.svelte";
	import { useWindow } from "../../windows/windows.svelte";

	/**
	 * Sample child window (Figure 17.13): Export closes with a value that resolves the opener's
	 * win.result promise. In native child windows, blocked attempts flash or shake this card.
	 */
	const k = getKernel();
	const self = useWindow<{ format: string; scale: number; transparent: boolean; open: boolean }>();
	let format = $state(String(self.props.format ?? "png"));
	let scale = $state(2);
	let transparent = $state(true);
	let openAfter = $state(false);
	let fx = $state("");
	const d = k.host.events.on<{ effects: string[] }>("fw://blocked", (m) => {
		fx = m.effects.includes("shake") ? "fw-shake" : "fw-flash";
		setTimeout(() => (fx = ""), 420);
	});
	onDestroy(() => d.dispose());
	const primaryFirst = k.host.platform === "windows";
</script>

<form class="flex h-full flex-col gap-4 p-5 {fx}" onsubmit={(e) => { e.preventDefault(); void self.close({ format, scale, transparent, open: openAfter }); }}>
	<fieldset class="flex flex-col gap-1"><legend class="mb-1 text-xs font-medium text-muted-foreground">Format</legend>
		<div class="flex gap-2">{#each ["png", "svg", "pdf"] as f (f)}<label class="flex items-center gap-1 text-sm"><input type="radio" bind:group={format} value={f} />{f.toUpperCase()}</label>{/each}</div>
	</fieldset>
	<label class="flex items-center gap-2 text-sm">Scale <input type="number" min="1" max="4" class="fw-input w-20" bind:value={scale} />x</label>
	<label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={transparent} />Transparent background</label>
	<label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={openAfter} />Open after export</label>
	<div class="mt-auto flex justify-end gap-2" class:flex-row-reverse={primaryFirst}>
		<button type="button" class="fw-btn" onclick={() => self.close()}>Cancel</button>
		<button type="submit" class="fw-btn fw-btn-primary">Export</button>
	</div>
</form>
