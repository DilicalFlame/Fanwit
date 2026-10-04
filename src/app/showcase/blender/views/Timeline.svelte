<script lang="ts">
	import Icon from "$fanwit/icons/Icon.svelte";
	import { scene, togglePlay } from "./blender.svelte";

	/** Play, scrub and set the frame range. Spinning objects turn as the frame changes. */
	let ruler = $state<HTMLDivElement>();
	const ticks = $derived(Array.from({ length: Math.floor(scene.end / 10) + 1 }, (_, i) => i * 10));
	const pct = (f: number) => ((f - 1) / Math.max(1, scene.end - 1)) * 100;

	function scrub(e: PointerEvent) {
		const el = ruler!;
		el.setPointerCapture(e.pointerId);
		const set = (ev: PointerEvent) => {
			const r = el.getBoundingClientRect();
			scene.frame = Math.round(1 + Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * (scene.end - 1));
		};
		set(e);
		const up = () => {
			el.removeEventListener("pointermove", set);
			el.removeEventListener("pointerup", up);
		};
		el.addEventListener("pointermove", set);
		el.addEventListener("pointerup", up);
	}
</script>

<div class="flex h-full flex-col">
	<div class="flex h-8 shrink-0 items-center gap-2 px-2">
		<button class="rounded p-1 hover:bg-white/10" aria-label="Jump to start" onclick={() => (scene.frame = 1)}><Icon name="skip-back" size={14} /></button>
		<button class="rounded p-1 hover:bg-white/10" aria-label={scene.playing ? "Pause" : "Play"} onclick={togglePlay}><Icon name={scene.playing ? "pause" : "play"} size={14} /></button>
		<button class="rounded p-1 hover:bg-white/10" aria-label="Jump to end" onclick={() => (scene.frame = scene.end)}><Icon name="skip-forward" size={14} /></button>
		<label class="ml-2 flex items-center gap-1">Frame <input class="w-14 rounded bg-[#545454] px-1 text-right" type="number" min="1" max={scene.end} bind:value={scene.frame} /></label>
		<label class="ml-auto flex items-center gap-1">End <input class="w-14 rounded bg-[#545454] px-1 text-right" type="number" min="10" bind:value={scene.end} /></label>
	</div>
	<div bind:this={ruler} class="relative mx-3 mb-2 min-h-8 flex-1 cursor-ew-resize rounded bg-[#262626]" role="slider" tabindex="0" aria-label="Current frame" aria-valuenow={scene.frame} aria-valuemin={1} aria-valuemax={scene.end} onpointerdown={scrub} onkeydown={(e) => { if (e.key === "ArrowRight") scene.frame = Math.min(scene.end, scene.frame + 1); else if (e.key === "ArrowLeft") scene.frame = Math.max(1, scene.frame - 1); }}>
		{#each ticks as t (t)}
			<div class="absolute top-0 bottom-0 border-l border-white/10" style:left="{pct(Math.max(1, t))}%"><span class="absolute top-0.5 left-1 text-[10px] opacity-50">{t}</span></div>
		{/each}
		{#each [1, scene.end] as f (f)}
			<div class="absolute bottom-2 size-2 -translate-x-1/2 rotate-45 bg-[#ffa726]" style:left="{pct(f)}%" title="Keyframe"></div>
		{/each}
		<div class="absolute top-0 bottom-0 w-0.5 bg-[#4772b3]" style:left="{pct(scene.frame)}%"><span class="absolute -top-0 -left-3 rounded bg-[#4772b3] px-1 text-[10px]">{scene.frame}</span></div>
	</div>
</div>
