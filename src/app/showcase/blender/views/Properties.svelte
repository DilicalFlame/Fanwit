<script lang="ts">
	import Icon from "$fanwit/icons/Icon.svelte";
	import { scene, selectedObj } from "./blender.svelte";

	/** Object, material and render tabs, like the Properties editor's icon column. */
	let tab = $state<"object" | "material" | "render">("object");
	let res = $state({ x: 1920, y: 1080, fps: 24 });
	const o = $derived(selectedObj());
	const TABS = [["render", "camera"], ["object", "square"], ["material", "circle-dot"]] as const;
</script>

<div class="flex h-full">
	<div class="flex w-8 shrink-0 flex-col items-center gap-1 bg-[#262626] py-1">
		{#each TABS as [id, icon] (id)}
			<button class="rounded p-1 {tab === id ? 'bg-[#4772b3]' : 'hover:bg-white/10'}" aria-label={id} title={id} onclick={() => (tab = id)}><Icon name={icon} size={14} /></button>
		{/each}
	</div>
	<div class="flex min-w-0 flex-1 flex-col gap-3 overflow-auto p-2">
		{#if tab === "render"}
			<div class="font-medium">Format</div>
			{#each [["Resolution X", "x"], ["Resolution Y", "y"], ["Frame Rate", "fps"]] as [label, key] (key)}
				<label class="flex items-center justify-between gap-2"><span class="opacity-70">{label}</span><input class="w-24 rounded bg-[#545454] px-1.5 py-0.5 text-right" type="number" bind:value={res[key as "x"]} /></label>
			{/each}
		{:else if !o}
			<p class="opacity-60">Nothing selected.</p>
		{:else if tab === "object"}
			<label class="flex items-center gap-2"><Icon name="square" size={13} class="text-[#ffa726]" /><input class="flex-1 rounded bg-[#545454] px-1.5 py-0.5" bind:value={o.name} /></label>
			{#each [["Location", "loc"], ["Rotation", "rot"]] as [label, key] (key)}
				<div>
					<div class="mb-1 opacity-70">{label}</div>
					{#each ["X", "Y", "Z"] as axis, i (axis)}
						<label class="mb-0.5 flex items-center gap-2"><span class="w-3 opacity-60">{axis}</span><input class="flex-1 rounded bg-[#545454] px-1.5 py-0.5 text-right" type="number" step={key === "loc" ? 0.1 : 5} bind:value={o[key as "loc"][i]} /></label>
					{/each}
				</div>
			{/each}
			<label class="flex items-center justify-between gap-2"><span class="opacity-70">Scale</span><input class="w-24 rounded bg-[#545454] px-1.5 py-0.5 text-right" type="number" step="0.1" min="0.1" bind:value={o.scale} /></label>
			<label class="flex items-center justify-between gap-2"><span class="opacity-70">Spin per frame</span><input class="w-24 rounded bg-[#545454] px-1.5 py-0.5 text-right" type="number" step="1" bind:value={o.spin} /></label>
		{:else}
			<div class="font-medium">Surface</div>
			<label class="flex items-center justify-between gap-2"><span class="opacity-70">Base Color</span><input type="color" class="h-6 w-24 cursor-pointer rounded bg-transparent" bind:value={o.color} /></label>
			<p class="opacity-60">Same colour as the Shader Editor's Principled BSDF node.</p>
		{/if}
		<div class="mt-auto text-[10px] opacity-50">Frame {scene.frame}</div>
	</div>
</div>
