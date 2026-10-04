<script lang="ts">
	import Icon from "$fanwit/icons/Icon.svelte";
	import { scene } from "./blender.svelte";

	const ICONS = { mesh: "triangle", camera: "video", light: "lightbulb" } as const;
</script>

<div class="h-full overflow-auto py-1">
	<div class="flex h-6 items-center gap-1.5 px-2"><Icon name="package" size={13} class="opacity-70" />Scene Collection</div>
	<div class="flex h-6 items-center gap-1.5 pl-5"><Icon name="folder" size={13} class="opacity-70" />Collection</div>
	{#each scene.objects as o (o.id)}
		<div class="flex h-6 items-center gap-1.5 pr-2 pl-9 {scene.selected === o.id ? 'bg-[#4772b3]/60' : 'hover:bg-white/5'}">
			<Icon name={ICONS[o.kind]} size={13} class="text-[#ffa726]" />
			<button class="flex-1 truncate text-left {o.hidden ? 'opacity-40' : ''}" onclick={() => (scene.selected = o.id)}>{o.name}</button>
			<button aria-label={o.hidden ? `Show ${o.name}` : `Hide ${o.name}`} class="opacity-70 hover:opacity-100" onclick={() => (o.hidden = !o.hidden || undefined)}><Icon name={o.hidden ? "eye-off" : "eye"} size={13} /></button>
		</div>
	{/each}
</div>
